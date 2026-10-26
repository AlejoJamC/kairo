import { localOllamaEndpoint } from './local-endpoint';
import { ProviderError, fetchOrThrow, type EmbeddingProvider } from '../base';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  public readonly model: string;
  public readonly dimensions: number;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'nomic-embed-text', dimensions: number = 384) {
    this.baseUrl = localOllamaEndpoint(baseUrl);
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetchOrThrow(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    }, 'Ollama embedding');

    if (!response.ok) {
      let contextExceeded = false;
      if (response.status === 400 || response.status === 500) {
        try {
          const body = await response.json() as { error?: unknown };
          contextExceeded = typeof body.error === 'string' && /input length.*(?:exceed|maximum).*context length/i.test(body.error);
        } catch { /* Provider response bodies never enter diagnostic messages. */ }
      }
      if (contextExceeded) return this.embedWithinContext(text);
      throw new ProviderError(`Ollama embedding request failed (HTTP ${response.status})`, response.status === 429 || response.status >= 500);
    }

    const data = await response.json() as { embedding: number[] };
    if (!Array.isArray(data.embedding) || data.embedding.length !== this.dimensions
      || data.embedding.some((value) => !Number.isFinite(value))) {
      throw new ProviderError('Ollama embedding dimensions do not match storage', false);
    }
    return data.embedding;
  }

  private async embedWithinContext(text: string): Promise<number[]> {
    const response = await fetchOrThrow(`${this.baseUrl}/api/embed`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text, truncate: true }),
    }, 'Ollama embedding');
    if (!response.ok) {
      throw new ProviderError(`Ollama embedding request failed (HTTP ${response.status})`, response.status === 429 || response.status >= 500);
    }
    const data = await response.json() as { embeddings?: unknown[] };
    const vector = data.embeddings?.[0];
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== 1 || !Array.isArray(vector) ||
      vector.length !== this.dimensions || vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new ProviderError('Ollama embedding dimensions do not match storage', false);
    }
    return vector as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }
}
