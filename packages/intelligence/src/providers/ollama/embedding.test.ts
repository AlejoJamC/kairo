import { afterEach, expect, mock, test } from 'bun:test';
import { OllamaEmbeddingProvider } from './embedding';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const provider = () => new OllamaEmbeddingProvider('http://127.0.0.1:11434','acme-embedding',2);

test('valid inputs preserve the existing embedding request and vector', async () => {
  const transport = mock(async (_url: unknown, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'acme-embedding', prompt: 'Invented Acme request' });
    return Response.json({ embedding: [1,2] });
  });
  globalThis.fetch = transport as unknown as typeof fetch;
  expect(await provider().embed('Invented Acme request')).toEqual([1,2]);
  expect(transport).toHaveBeenCalledTimes(1);
});

test('only a context overflow uses the bounded endpoint with the same full input and model', async () => {
  const text = 'Invented Acme request '.repeat(500);
  const transport = mock(async (url: unknown, init?: RequestInit) => {
    if (String(url).endsWith('/api/embeddings')) return Response.json({ error: 'the input length exceeds the context length' },{ status: 500 });
    expect(String(url)).toBe('http://127.0.0.1:11434/api/embed');
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'acme-embedding',input: text,truncate: true });
    return Response.json({ embeddings: [[0.6,0.8]] });
  });
  globalThis.fetch = transport as unknown as typeof fetch;
  expect(await provider().embed(text)).toEqual([0.6,0.8]);
  expect(transport).toHaveBeenCalledTimes(2);
});

test('authentication and unrelated server failures do not trigger context handling or expose provider bodies', async () => {
  for (const status of [401,429,500,503]) {
    const transport = mock(async () => Response.json({ error: 'Acme-private-provider-payload' },{ status }));
    globalThis.fetch = transport as unknown as typeof fetch;
    await expect(provider().embed('Invented input')).rejects.toThrow(`HTTP ${status}`);
    expect(transport).toHaveBeenCalledTimes(1);
  }
});

test('bounded embeddings preserve response count, finite values and configured dimensions', async () => {
  for (const embeddings of [[],[[1]],[[1,2],[1,2]],[[1,'invalid']]]) {
    globalThis.fetch = mock(async (url: unknown) => String(url).endsWith('/api/embeddings')
      ? Response.json({ error: 'input length exceeds context length' },{ status: 500 }) : Response.json({ embeddings })) as unknown as typeof fetch;
    await expect(provider().embed('Invented input')).rejects.toThrow('dimensions do not match');
  }
});

test('a bounded endpoint outage remains a typed provider failure', async () => {
  globalThis.fetch = mock(async (url: unknown) => String(url).endsWith('/api/embeddings')
    ? Response.json({ error: 'input length exceeds context length' },{ status: 500 })
    : Response.json({ error: 'Acme-private-provider-payload' },{ status: 503 })) as unknown as typeof fetch;
  await expect(provider().embed('Invented input')).rejects.toMatchObject({ name: 'ProviderError',retriable: true });
});
