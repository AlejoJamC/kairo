import { describe, expect, test, mock } from 'bun:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { syntheticCases, contracts } from './cases';
import { summarize, reviewTemplate, type Measurement } from './metrics';
import { guardNetwork } from './network';
import { privatePath, privateRoot, root } from './private-files';
import { main } from './run';

const row = (): Measurement => ({ case: syntheticCases[6]!, status: 'completed', prediction: { contribution: 'solution', useful: 'true' },
  abstain: null, latencyMs: 10, requests: [], output: { invented: true }, calls: [], safety: { approvedSourcesOnly: true } });

describe('evaluation accounting', () => {
  test('covers each contract and dry plan never reads a corpus or calls a model', async () => {
    expect(new Set(syntheticCases.map(c => c.contract))).toEqual(new Set(contracts));
    const original = globalThis.fetch;
    const denied = mock(async () => { throw new Error('Network forbidden'); });
    globalThis.fetch = denied as unknown as typeof fetch;
    try { expect(await main(['plan', 'main'])).toHaveProperty('network', false); expect(denied).not.toHaveBeenCalled(); }
    finally { globalThis.fetch = original; }
  });
  test('unknown cost, no observations and unreviewed usefulness stay unknown', () => {
    const report = summarize([row()]);
    const cell = report.find(c => c.contract === 'knowledge_impact' && c.dataset === 'synthetic')!;
    expect(cell).toMatchObject({ completed: 1, reviewPending: 1, costUsd: null, abstention: null });
    expect(cell.enrichment).toMatchObject({ coverage: 1, acceptedImprovements: null, confirmedSolutions: null });
    expect(report.find(c => c.dataset === 'main')!.latencyMs).toBeNull();
  });
  test('execution failure lowers quality and coverage instead of disappearing', () => {
    const failed = { ...row(), status: 'failed' as const, prediction: {} };
    const cell = summarize([row(), failed])[3]!;
    expect(cell.failed).toBe(1);
    expect(cell.enrichment!.coverage).toBe(0.5);
    expect(cell.fields['contribution']!.macro_recall).toBe(0.5);
  });
  test('reviews belong to the exact input and output, with explicit failed ratings', () => {
    const measurement = row();
    const review = reviewTemplate([measurement])[0]!;
    review.ratings = review.ratings.map(() => false);
    expect(summarize([measurement], [review])[3]!.rubricFailures).toBe(review.ratings.length);
    expect(() => summarize([{ ...measurement, output: { changed: true } }], [review])).toThrow('stale');
    expect(() => summarize([measurement], [review, review])).toThrow('Duplicate');
  });
});

describe('evaluation boundaries', () => {
  test('rejects paths outside private storage and symlink escapes', async () => {
    await expect(privatePath(resolve(root, 'evals/leak.json'))).rejects.toThrow();
    const temp = await mkdtemp(resolve(tmpdir(), 'kairo-eval-'));
    const link = resolve(privateRoot, `eval-link-${Date.now()}`);
    try {
      await writeFile(resolve(temp, 'invented.json'), '{}');
      await symlink(temp, link);
      await expect(privatePath(resolve(link, 'invented.json'))).rejects.toThrow('Linked');
    } finally { await rm(link, { force: true }); await rm(temp, { recursive: true, force: true }); }
  });
  test('rejects database and direct provider requests before transport', async () => {
    const transport = mock(async () => new Response('{}'));
    const network = guardNetwork(1, transport as unknown as typeof fetch);
    await expect(network.fetch('https://acme.com/database', { method: 'POST' })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  test('caps requests, records verified BYOK and prevents redirects', async () => {
    const transport = mock(async (_input: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      return Response.json({ providerMetadata: { gateway: { cost: '0', routing: { modelAttempts: [
        { providerAttempts: [{ success: true, credentialType: 'byok', provider: 'acme' }] },
      ] } } } });
    });
    const network = guardNetwork(1, transport as unknown as typeof fetch);
    await network.fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST' });
    expect(network.requests).toEqual([{ status: 200, costUsd: 0, credentialType: 'byok' }]);
    await expect(network.fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST' })).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test('stops on missing BYOK evidence without retrying', async () => {
    const transport = mock(async () => Response.json({}));
    const network = guardNetwork(10, transport as unknown as typeof fetch);
    await expect(network.fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST' })).rejects.toThrow();
    await expect(network.fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST' })).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
