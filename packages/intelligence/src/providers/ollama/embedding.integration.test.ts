import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createEmbeddingProvider, configuredEmbeddingDimensions } from '../../config/providers';
import { resolveModelRoute } from '../../config/model-roles';

const enabled = process.env['RUN_OLLAMA_EMBEDDING_TESTS'] === '1' && !process.env['CI'];

describe.skipIf(!enabled)('configured local embedding provider without a database', () => {
  let originalFetch: typeof fetch;
  beforeAll(() => {
    expect(resolveModelRoute('embedding').provider).toBe('ollama');
    expect(configuredEmbeddingDimensions()).toBe(768);
    const endpoint = new URL(process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434');
    expect(['127.0.0.1','localhost','[::1]']).toContain(endpoint.hostname);
    expect(endpoint.protocol).toBe('http:');
    expect(endpoint.port).toBe('11434');
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== endpoint.origin) throw new Error('Provider test refuses non-local model endpoints');
      return originalFetch(input, { ...init, redirect: 'error' });
    }) as typeof fetch;
  });
  afterAll(() => { if (originalFetch) globalThis.fetch = originalFetch; });

  it('generates finite nonzero vectors through the configured provider factory', async () => {
    const vector = await createEmbeddingProvider().embed('Recover access to the invented Acme account.');
    expect(vector).toHaveLength(768);
    expect(vector.every(Number.isFinite)).toBe(true);
    expect(vector.some(value => value !== 0)).toBe(true);
  }, 180000);

  it('preserves dimensions and item count in a real batch without storage', async () => {
    const vectors = await createEmbeddingProvider().embedBatch(['Invented Acme access recovery.', 'Invented Acme parcel tracking.']);
    expect(vectors).toHaveLength(2);
    expect(vectors.every(vector => vector.length === 768 && vector.every(Number.isFinite))).toBe(true);
  }, 180000);
});
