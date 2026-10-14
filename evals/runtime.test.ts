import { expect, test, mock } from 'bun:test';
import { createRuntime } from './runtime';
import { syntheticCases } from './cases';

test('withdrawn enrichment uses production guards without invoking any model', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = Object.assign(async () => { requests++; throw new Error('No inference permitted'); }, original) as typeof fetch;
  try {
    const execute = await createRuntime();
    const result = await execute(syntheticCases[8]!);
    expect(result.prediction).toEqual({ skipped: 'true' });
    expect(result.output).toEqual([]);
    expect(requests).toBe(0);
  } finally { globalThis.fetch = original; }
});

test('first delivery calls the production classifier with its bounded contract', async () => {
  type Classify = typeof import('../packages/intelligence/src/classification/classify').classifyEmailWithMeta;
  const classify = mock<Classify>(async () => ({ result: { type: 'support' },
    verdict: { priority: 'P2', urgency: 'medium', category: 'account', tone: 'neutral',
      workflow: { judgments: { request: 'intervention', priority_evidence: 'unknown', urgency_evidence: 'unknown' } } },
    abstain: true } as unknown as Awaited<ReturnType<Classify>>));
  const execute = await createRuntime(classify);
    const result = await execute(syntheticCases[0]!);
    expect(classify.mock.calls[0]?.[0]).toMatchObject({ stage: 'onboarding' });
    expect(classify.mock.calls[0]?.[0].businessContext).toBeUndefined();
    expect(result.safety.firstDeliveryIndependent).toBe(true);
    expect(result.abstain).toBe(true);
});

test('private corpus input keeps missing mailbox and recipients absent without network calls', async () => {
  type Classify = typeof import('../packages/intelligence/src/classification/classify').classifyEmailWithMeta;
  const classify = mock<Classify>(async () => ({result:{type:'support'},verdict:{priority:'P2',urgency:'medium',category:'account',tone:'neutral'},abstain:true} as Awaited<ReturnType<Classify>>));
  const execute = await createRuntime(classify);
  await execute({...syntheticCases[0]!,dataset:'main',mailbox:undefined,to:undefined,from:undefined});
  const input = classify.mock.calls[0]![0];
  expect(input.tenantMailbox).toBe('');
  expect(input.from).toBe('');
  expect(input.to).toBeUndefined();
  expect(input.evidence?.missing).toContain('tenant_mailbox');
});

test('private corpus input passes every tenant mailbox and the full header record to the classifier', async () => {
  type Classify = typeof import('../packages/intelligence/src/classification/classify').classifyEmailWithMeta;
  const classify = mock<Classify>(async () => ({result:{type:'support'},verdict:{priority:'P2',urgency:'medium',category:'account',tone:'neutral'},abstain:true} as Awaited<ReturnType<Classify>>));
  const execute = await createRuntime(classify);
  await execute({...syntheticCases[0]!,dataset:'main',from:'billing@acme.com',mailbox:'support@acme.com',mailboxes:['support@acme.com','billing@acme.com'],
    headers:{to:'support@acme.com',precedence:'bulk'}});
  const input = classify.mock.calls[0]![0];
  expect(input.tenantMailbox).toBe('support@acme.com');
  expect(input.facts).toMatchObject({ senderIsTenantAddress: true, isBulk: true });
  expect(input.evidence?.missing).not.toContain('tenant_mailbox');
});
