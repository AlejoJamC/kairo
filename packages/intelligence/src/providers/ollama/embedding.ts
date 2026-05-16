import type { EmbeddingProvider } from '../base';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  public readonly model: string;
  public readonly dimensions: number;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'nomic-embed-text', dimensions: number = 384) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama embeddings error: ${response.status} ${response.statusText} — ${body}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }
}
