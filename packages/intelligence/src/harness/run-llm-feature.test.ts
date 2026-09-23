import { describe, it, expect, mock } from 'bun:test';
import { z } from 'zod';

import { ProviderError, type CompletionProvider } from '../providers/base';
import { runLlmFeature, runLlmTextFeature, type LlmCallRecord } from './run-llm-feature';
import { LlmFeatureError, fillTemplate, loadPromptTemplate, extractPromptVersion } from './template';

// The reply-suggestion prompt is a real template with nine placeholders; using
// it keeps these tests honest about the loader and the filler.
const REPLY_VARS = {
  subject: 'Cannot log in',
  ticket_type: 'support',
  priority: 'P2',
  category: 'account',
  emotion: 'neutral',
  client_profile: 'Name: Acme | Plan: pro | SLA: standard',
  message_history: '[Client] I cannot log in to support@acme.com',
  similar_case: 'none',
  kb_articles: 'none',
};

const Schema = z.object({ suggestion: z.string(), confidence: z.number() });

function fakeProvider(overrides: Partial<CompletionProvider> = {}): CompletionProvider {
  return {
    model: 'configured-model',
    complete: mock(async () => ''),
    completeJSON: mock(async () => ({}) as never),
    completeWithMeta: mock(async () => ({
      text: 'plain answer',
      rawText: 'plain answer',
      model: 'reported-model',
      usage: { promptTokens: 7, completionTokens: 3 },
      tokensPerSecond: null,
    })),
    completeJSONWithMeta: mock(async () => ({
      data: { suggestion: 'Hello from Acme', confidence: 0.6 },
      rawText: '{"suggestion":"Hello from Acme","confidence":0.6}',
      model: 'reported-model',
      usage: { promptTokens: 120, completionTokens: 40 },
      tokensPerSecond: null,
    })) as CompletionProvider['completeJSONWithMeta'],
    ...overrides,
  };
}

describe('template', () => {
  it('loads a versioned prompt by id and language', async () => {
    const template = await loadPromptTemplate('reply-suggestion', 'en');
    expect(extractPromptVersion(template)).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('fails with template_missing for an unknown prompt, instead of answering in another language', async () => {
    const err = await loadPromptTemplate('no-such-prompt', 'en').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmFeatureError);
    expect((err as LlmFeatureError).code).toBe('template_missing');
    expect((err as LlmFeatureError).retriable).toBe(false);
  });

  it('fills every placeholder', () => {
    expect(fillTemplate('{{a}} and {{b}} and {{a}}', { a: 'x', b: 'y' })).toBe('x and y and x');
  });

  it('refuses to send a prompt with an unfilled placeholder', () => {
    expect(() => fillTemplate('{{known}} {{unknown}}', { known: 'yes' })).toThrow(/unknown/);
  });
});

describe('runLlmFeature', () => {
  it('returns the parsed answer, the prompt version and the model the provider reported', async () => {
    const result = await runLlmFeature({
      feature: 'reply_suggestion',
      promptId: 'reply-suggestion',
      lang: 'en',
      vars: REPLY_VARS,
      schema: Schema,
      provider: fakeProvider(),
    });

    expect(result.data).toEqual({ suggestion: 'Hello from Acme', confidence: 0.6 });
    expect(result.model).toBe('reported-model');
    expect(result.promptVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.prompt).toContain('Cannot log in');
    expect(result.prompt).not.toMatch(/\{\{\w+\}\}/);
    expect(result.llmCallId).toBeNull();
  });

  it('logs exactly one record on success, with the reported model and the chosen confidence field', async () => {
    const records: LlmCallRecord[] = [];
    const result = await runLlmFeature({
      feature: 'reply_suggestion',
      promptId: 'reply-suggestion',
      lang: 'en',
      vars: REPLY_VARS,
      schema: Schema,
      confidenceOf: (d) => d.confidence,
      context: { ticketId: 't-1', accountId: 'a-1', userId: 'u-1' },
      provider: fakeProvider(),
      logger: async (r) => {
        records.push(r);
        return 'row-1';
      },
    });

    expect(result.llmCallId).toBe('row-1');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      feature: 'reply_suggestion',
      model: 'reported-model',
      promptTokens: 120,
      completionTokens: 40,
      confidenceScore: 0.6,
      errorCode: null,
      ticketId: 't-1',
      accountId: 'a-1',
      userId: 'u-1',
    });
  });

  it('logs the failure and rethrows the ProviderError unchanged, keeping retriable', async () => {
    const failure = new ProviderError('rate limited', true, 2000);
    const records: LlmCallRecord[] = [];
    const provider = fakeProvider({
      completeJSONWithMeta: mock(async () => {
        throw failure;
      }) as CompletionProvider['completeJSONWithMeta'],
    });

    const err = await runLlmFeature({
      feature: 'reply_suggestion',
      promptId: 'reply-suggestion',
      lang: 'en',
      vars: REPLY_VARS,
      schema: Schema,
      provider,
      logger: async (r) => {
        records.push(r);
        return null;
      },
    }).catch((e: unknown) => e);

    expect(err).toBe(failure);
    expect((err as ProviderError).retriable).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ errorCode: 'LLM_ERROR', errorDetail: 'rate limited', model: 'configured-model' });
  });

  it('never fails the call because logging failed', async () => {
    const result = await runLlmFeature({
      feature: 'reply_suggestion',
      promptId: 'reply-suggestion',
      lang: 'en',
      vars: REPLY_VARS,
      schema: Schema,
      provider: fakeProvider(),
      logger: async () => {
        throw new Error('db down');
      },
    });
    expect(result.llmCallId).toBeNull();
  });

  it('does not call the model when a placeholder is missing', async () => {
    const provider = fakeProvider();
    const { subject: _omitted, ...incomplete } = REPLY_VARS;
    const err = await runLlmFeature({
      feature: 'reply_suggestion',
      promptId: 'reply-suggestion',
      lang: 'en',
      vars: incomplete,
      schema: Schema,
      provider,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LlmFeatureError);
    expect((err as LlmFeatureError).code).toBe('placeholder_unfilled');
    expect(provider.completeJSONWithMeta).not.toHaveBeenCalled();
  });
});

describe('runLlmTextFeature', () => {
  it('returns free text through the same path', async () => {
    const result = await runLlmTextFeature({
      feature: 'summarization',
      promptId: 'reply-suggestion',
      lang: 'es',
      vars: REPLY_VARS,
      provider: fakeProvider(),
    });
    expect(result.data).toBe('plain answer');
    expect(result.model).toBe('reported-model');
  });
});
