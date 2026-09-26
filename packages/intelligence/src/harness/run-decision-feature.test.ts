import { describe, it, expect, mock } from 'bun:test';

import { ProviderError } from '../providers/base';
import type { DecisionProvider } from '../providers/decision';
import { runDecisionFeature } from './run-decision-feature';
import type { LlmCallRecord } from './run-llm-feature';

function fakeProvider(overrides: Partial<DecisionProvider> = {}): DecisionProvider {
  return {
    provider: 'jev',
    model: 'jev-latest',
    decide: mock(async () => ({
      value: { category: { type: 'choice', choice: 'billing', confidence: 0.9 } },
      confidence: 0.9,
      provider: 'jev',
      modelVersion: 'jev-latest',
      latencyMs: 12,
      rawMetadata: { usage: { input_tokens: 30, output_tokens: 5 } },
    })) as DecisionProvider['decide'],
    ...overrides,
  };
}

describe('runDecisionFeature', () => {
  it('returns the provider result unchanged', async () => {
    const result = await runDecisionFeature({
      feature: 'ticket_category',
      provider: fakeProvider(),
      state: { document: 'I was charged twice' },
      questions: { category: { type: 'choice', criteria: { billing: null } } },
    });

    expect(result.data.value).toEqual({ category: { type: 'choice', choice: 'billing', confidence: 0.9 } });
    expect(result.data.confidence).toBe(0.9);
    expect(result.llmCallId).toBeNull();
  });

  it('logs exactly one record on success, with the reported model, provider and usage', async () => {
    const records: LlmCallRecord[] = [];
    const result = await runDecisionFeature({
      feature: 'ticket_category',
      provider: fakeProvider(),
      state: { document: 'I was charged twice' },
      questions: { category: { type: 'choice', criteria: { billing: null } } },
      context: { ticketId: 't-1', accountId: 'a-1' },
      logger: async (r) => {
        records.push(r);
        return 'row-1';
      },
    });

    expect(result.llmCallId).toBe('row-1');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      feature: 'ticket_category',
      provider: 'jev',
      model: 'jev-latest',
      promptTokens: 30,
      completionTokens: 5,
      confidenceScore: 0.9,
      errorCode: null,
      ticketId: 't-1',
      accountId: 'a-1',
    });
    expect(JSON.parse(records[0]!.promptText)).toEqual({
      state: { document: 'I was charged twice' },
      questions: { category: { type: 'choice', criteria: { billing: null } } },
    });
  });

  it('logs the failure with the provider family, and rethrows the ProviderError unchanged', async () => {
    const failure = new ProviderError('rate limited', true, 2000);
    const records: LlmCallRecord[] = [];
    const provider = fakeProvider({
      decide: mock(async () => {
        throw failure;
      }) as DecisionProvider['decide'],
    });

    const err = await runDecisionFeature({
      feature: 'ticket_category',
      provider,
      state: 'x',
      questions: { q: { type: 'noul' } },
      logger: async (r) => {
        records.push(r);
        return null;
      },
    }).catch((e: unknown) => e);

    expect(err).toBe(failure);
    expect((err as ProviderError).retriable).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      errorCode: 'LLM_ERROR',
      errorDetail: 'rate limited',
      provider: 'jev',
      model: 'jev-latest',
    });
  });

  it('never fails the call because logging failed', async () => {
    const result = await runDecisionFeature({
      feature: 'ticket_category',
      provider: fakeProvider(),
      state: 'x',
      questions: { q: { type: 'noul' } },
      logger: async () => {
        throw new Error('db down');
      },
    });
    expect(result.llmCallId).toBeNull();
  });

  it('the provider field never falls back to INTELLIGENCE_PROVIDER — it always names the decision provider', async () => {
    const records: LlmCallRecord[] = [];
    await runDecisionFeature({
      feature: 'ticket_category',
      provider: fakeProvider(),
      state: 'x',
      questions: { q: { type: 'noul' } },
      logger: async (r) => {
        records.push(r);
        return null;
      },
    });
    expect(records[0]!.provider).toBe('jev');
  });
});
