import { afterEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { GatewayCompletionProvider } from './completion';
import { GatewayEmbeddingProvider } from './embedding';
import { ProviderConfigurationError, ProviderError } from '../base';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

export function catalog(model: string, modelType = 'language') {
  return { models: [{ id: model, name: 'Synthetic model', modelType,
    specification: { specificationVersion: 'v4', provider: 'gateway', modelId: model } }] };
}

export function generation(text: string) {
  return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' },
    usage: { inputTokens: { total: 8 }, outputTokens: { total: 3 } }, warnings: [],
    providerMetadata: { gateway: { routing: { canonicalSlug: 'openai/reported-model' }, cost: '0.0001' } } };
}

describe('Gateway providers', () => {
  it('uses the Gateway catalogue and AI SDK structured generation with one credential', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push(url);
      expect(new URL(url).hostname).toBe('ai-gateway.vercel.sh');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key');
      if (!url.endsWith('/config')) expect(JSON.parse(init?.body as string).providerOptions.gateway.only).toEqual(['openai']);
      const body = url.endsWith('/config') ? catalog('openai/test-model') : generation('{"label":"support"}');
      return Response.json(body);
    }) as typeof fetch;
    const result = await new GatewayCompletionProvider('test-key', 'openai/test-model', globalThis.fetch)
      .completeJSONWithMeta('Synthetic Acme support request', z.object({ label: z.literal('support') }));
    expect(result.data.label).toBe('support');
    expect(result.usage).toEqual({ promptTokens: 8, completionTokens: 3 });
    expect(result.model).toBe('openai/reported-model');
    expect(result.costUsd).toBe(0.0001);
    expect(calls).toEqual(['https://ai-gateway.vercel.sh/v4/ai/config', 'https://ai-gateway.vercel.sh/v4/ai/language-model']);
  });

  it('recovers a JSON object the model wrapped in a code fence, and still validates it', async () => {
    let answer = '';
    const respond = (text: string) => {
      answer = text;
      globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/config')
        ? Response.json(catalog('openai/test-model'))
        : Response.json(generation(answer))) as typeof fetch;
    };
    const schema = z.object({ label: z.literal('support') });

    respond('```json\n{"label":"support"}\n```');
    const provider = new GatewayCompletionProvider('fenced-json-key', 'openai/test-model', globalThis.fetch);
    const result = await provider.completeJSONWithMeta('Synthetic input', schema);
    expect(result.data).toEqual({ label: 'support' });
    expect(result.rawText).toContain('```json');

    respond('```json\n{"label":"other"}\n```');
    const invalid = await provider.completeJSONWithMeta('Synthetic input', schema).catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(ProviderError);
    expect((invalid as ProviderError).message).toMatch(/requested schema/);
  });

  it('rejects an unavailable capability before sending a prompt', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input)); return Response.json(catalog('typesafe-ai/jev', 'decision'));
    }) as typeof fetch;
    const error = await new GatewayCompletionProvider('test-key', 'typesafe-ai/jev', globalThis.fetch).complete('Synthetic input').catch((error: unknown) => error);
    // A deployment fault: fixing the configured model recovers the message.
    expect(error).toBeInstanceOf(ProviderConfigurationError);
    expect((error as ProviderError).retriable).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('sanitizes provider errors and preserves rate limits and authentication failures', async () => {
    for (const [status, retriable] of [[401, false], [429, true], [503, true]] as const) {
      globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/config')
        ? Response.json(catalog('openai/test-model'))
        : Response.json({ error: { message: 'private-request-marker test-key', type: 'invalid_request_error' } }, { status })) as typeof fetch;
      const error = await new GatewayCompletionProvider('test-key', 'openai/test-model', globalThis.fetch).complete('Synthetic input').catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).retriable).toBe(retriable);
      expect(String(error)).not.toContain('test-key');
      expect(String(error)).not.toContain('private-request-marker');
    }
  });

  it('rejects malformed structured output without regex recovery', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => Response.json(String(input).endsWith('/config')
      ? catalog('openai/test-model') : generation('prose {"label":"support"}'))) as typeof fetch;
    const error = await new GatewayCompletionProvider('test-key', 'openai/test-model', globalThis.fetch)
      .completeJSON('Synthetic input', z.object({ label: z.string() })).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).retriable).toBe(false);
  });

  it('rejects embedding vectors that do not fit storage', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => Response.json(String(input).endsWith('/config')
      ? catalog('voyage/test-model', 'embedding') : { embeddings: [[1, 2]], usage: { tokens: 2 } })) as typeof fetch;
    const error = await new GatewayEmbeddingProvider('test-key', 'voyage/test-model', 512, globalThis.fetch).embed('Synthetic input').catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).retriable).toBe(false);
  });
});
