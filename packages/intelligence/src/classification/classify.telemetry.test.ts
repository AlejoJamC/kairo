import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mock } from 'bun:test';
import type { EmailMessage } from './types';

// Isolated from classify.test.ts (which exercises real Ollama calls) so mocking
// the provider here can't affect those integration tests. A module mock reaches
// every later file in the run, so the real module is restored after this suite.
const completeJSONWithMeta = vi.fn();
const realProviders = { ...await import('../config/providers') };
afterAll(() => { mock.module('../config/providers', () => realProviders); });

mock.module('../config/providers', () => ({
  ...realProviders,
  createCompletionProvider: () => ({
    model: 'test-model',
    complete: vi.fn(),
    completeJSON: vi.fn(),
    completeWithMeta: vi.fn(),
    completeJSONWithMeta,
  }),
}));

const { classifyEmailWithMeta } = await import('./classify');

const message: EmailMessage = { subject: 'S', body: 'B', from: 'a@b.com' };

describe('classifyEmailWithMeta — Langfuse instrumentation (KAI-126)', () => {
  beforeEach(() => {
    completeJSONWithMeta.mockReset();
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
  });

  it('returns an initial ticket classification with unknown judgments and its incomplete input evidence', async () => {
    completeJSONWithMeta.mockResolvedValue({
      data: { actionability: 'needs_action', subject_matter: 'service', priority: 'P3',
        category: 'account', tone: 'neutral', urgency: 'low', reasoning: 'Access help requested; impact and deadline are unknown.', confidence: 0.5,
        workflow: { request: 'intervention', priority_evidence: 'unknown', urgency_evidence: 'unknown' } },
      rawText: '{}', model: 'test-model', usage: { promptTokens: 10, completionTokens: 5 },
    });
    const evidence = { bodySource: 'snippet' as const, truncated: false, missing: ['full_body'] };
    const { result, verdict, abstain } = await classifyEmailWithMeta({
      subject: 'Access help', body: 'Please help me access my account.', from: 'client@outside.com', stage: 'onboarding', evidence,
    });
    expect(result.type).toBe('support');
    expect(abstain).toBe(true);
    expect(verdict.evidence).toEqual(evidence);
    expect(verdict.workflow).toMatchObject({ contract: 'onboarding_triage', judgments: {
      request: 'intervention', priority_evidence: 'unknown', urgency_evidence: 'unknown',
    } });
    expect(completeJSONWithMeta).toHaveBeenCalledTimes(1);
  });

  it('propagates provider errors — the Langfuse wrapper must never swallow a real failure', async () => {
    completeJSONWithMeta.mockRejectedValue(new Error('provider exploded'));

    await expect(classifyEmailWithMeta(message)).rejects.toThrow('provider exploded');
  });

  it('returns the classification result unaffected when LANGFUSE_* env vars are unset (tracing is a no-op)', async () => {
    completeJSONWithMeta.mockResolvedValue({
      data: {
        type: 'support',
        priority: 'P3',
        category: 'general',
        tone: 'neutral',
        urgency: 'low',
        reasoning: 'stub',
        workflow: { request:'intervention',priority_evidence:'supported',urgency_evidence:'supported',alternative:'unknown',change:'new_request',next_action:'respond' },
        confidence: 0.8,
      },
      rawText: '{"stub":true}',
      model: 'test-model',
      usage: { promptTokens: 10, completionTokens: 5 },
    });

    const { result, meta } = await classifyEmailWithMeta(message);

    expect(meta.model).toBe('test-model');
    expect(meta.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(result.confidence).toBe(0.8);
  });

  it('returns the result even when usage tokens are null (no usageDetails to report)', async () => {
    completeJSONWithMeta.mockResolvedValue({
      data: {
        type: 'support',
        priority: 'P3',
        category: 'general',
        tone: 'neutral',
        urgency: 'low',
        reasoning: 'stub',
        workflow: { request:'intervention',priority_evidence:'supported',urgency_evidence:'supported',alternative:'unknown',change:'new_request',next_action:'respond' },
        confidence: 0.5,
      },
      rawText: '{"stub":true}',
      model: 'test-model',
      usage: { promptTokens: null, completionTokens: null },
    });

    const { result } = await classifyEmailWithMeta(message);
    expect(result.confidence).toBe(0.5);
  });
});
