import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailMessage } from './types';

// Isolated from classify.test.ts (which exercises real Ollama calls) so mocking
// the provider here can't affect those integration tests.
const completeJSONWithMeta = vi.fn();

vi.mock('../config/providers', () => ({
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
