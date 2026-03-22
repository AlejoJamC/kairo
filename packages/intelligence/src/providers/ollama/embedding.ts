import type { EmbeddingProvider } from '../base';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  public readonly model = 'nomic-embed-text';
  public readonly dimensions = 384;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
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
      throw new Error(`Ollama embeddings error: ${response.statusText}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }
}
