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
      throw new ProviderError(`Ollama embedding request failed (HTTP ${response.status})`, response.status === 429 || response.status >= 500);
    }

    const data = await response.json() as { embedding: number[] };
    if (!Array.isArray(data.embedding) || data.embedding.length !== this.dimensions
      || data.embedding.some((value) => !Number.isFinite(value))) {
      throw new ProviderError('Ollama embedding dimensions do not match storage', false);
    }
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }
}
