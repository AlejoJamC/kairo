import { describe, it, expect, afterEach } from 'bun:test';

import { ProviderError } from '../base';
import { JevDecisionProvider } from './decision';

// ---------------------------------------------------------------------------
// This adapter is plumbing: it forwards state/questions and normalizes the
// reply. These tests check exactly that — not what a question means, which
// stays with the caller (KAI-55).
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

let lastUrl = '';
let lastInit: RequestInit = {};

function mockSystemOne(body: unknown, status = 200): void {
  lastUrl = '';
  lastInit = {};
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    lastUrl = url;
    lastInit = init;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const provider = () => new JevDecisionProvider('test-key', 'jev-latest');

describe('JevDecisionProvider', () => {
  it('forwards state and questions to POST /v1/systemone, unchanged', async () => {
    mockSystemOne({
      model: 'jev-latest',
      answers: { category: { type: 'choice', choice: 'billing', confidence: 0.9, probabilities: { billing: 0.9 } } },
      usage: { input_tokens: 10, output_tokens: 2 },
    });

    await provider().decide({
      state: { document: 'I was charged twice' },
      questions: { category: { type: 'choice', criteria: { billing: null } } },
    });

    expect(lastUrl).toBe('https://api.typesafe.ai/v1/systemone');
    const sent = JSON.parse(lastInit.body as string);
    expect(sent.state).toEqual({ document: 'I was charged twice' });
    expect(sent.questions).toEqual({ category: { type: 'choice', criteria: { billing: null } } });
    expect(sent.model).toBe('jev-latest');
  });

  it('authenticates with a bearer token built from the api key', async () => {
    mockSystemOne({
      model: 'jev-latest',
      answers: { q: { type: 'noul', noul: 0.5 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await provider().decide({ state: 'x', questions: { q: { type: 'noul' } } });

    const headers = lastInit.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key');
  });

  it('extracts confidence from a single noul answer', async () => {
    mockSystemOne({
      model: 'jev-latest',
      answers: { billing: { type: 'noul', noul: 0.87 } },
      usage: { input_tokens: 5, output_tokens: 1 },
    });

    const result = await provider().decide({ state: 'x', questions: { billing: { type: 'noul' } } });
    expect(result.confidence).toBe(0.87);
    expect(result.provider).toBe('jev');
    expect(result.modelVersion).toBe('jev-latest');
    expect(result.value).toEqual({ billing: { type: 'noul', noul: 0.87 } });
  });

  it('extracts confidence from a single choice answer', async () => {
    mockSystemOne({
      model: 'jev-latest',
      answers: { category: { type: 'choice', choice: 'billing', confidence: 0.72, probabilities: { billing: 0.72 } } },
      usage: { input_tokens: 5, output_tokens: 1 },
    });

    const result = await provider().decide({
      state: 'x',
      questions: { category: { type: 'choice', criteria: { billing: null } } },
    });
    expect(result.confidence).toBe(0.72);
  });

  it('has no single confidence when the call asked more than one question', async () => {
    mockSystemOne({
      model: 'jev-latest',
      answers: {
        billing: { type: 'noul', noul: 0.9 },
        urgency: { type: 'score', score: 2, confidence: 0.6, legend: {}, probabilities: {} },
      },
      usage: { input_tokens: 5, output_tokens: 2 },
    });

    const result = await provider().decide({
      state: 'x',
      questions: { billing: { type: 'noul' }, urgency: { type: 'score', criteria: ['low', 'high'] } },
    });
    expect(result.confidence).toBeNull();
  });

  it('wraps a bad-request error as non-retriable', async () => {
    mockSystemOne({ error: 'bad request' }, 400);

    const err = await provider()
      .decide({ state: 'x', questions: { q: { type: 'noul' } } })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retriable).toBe(false);
  });

  it('wraps a rate-limit error as retriable', async () => {
    mockSystemOne({ error: 'slow down' }, 429);

    const err = await provider()
      .decide({ state: 'x', questions: { q: { type: 'noul' } } })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retriable).toBe(true);
  }, 10_000);
});
