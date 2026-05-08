import type { EmbeddingProvider } from '../base';
import { VOYAGE_EMBEDDING_MODEL, VOYAGE_EMBEDDING_DIMENSIONS } from '../../config/constants';

interface VoyageResponse {
  data: Array<{ embedding: number[] }>;
}

// voyage-3-lite emits 512-dim vectors natively, matching the pgvector(512)
// columns used by KAI-42 (tickets.embedding, kb_articles.embedding).
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  public readonly model = VOYAGE_EMBEDDING_MODEL;
  public readonly dimensions = VOYAGE_EMBEDDING_DIMENSIONS;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Voyage API error: ${response.statusText} - ${error}`);
    }

    const data = await response.json() as VoyageResponse;
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Voyage API error: ${response.statusText} - ${error}`);
    }

    const data = await response.json() as VoyageResponse;
    return data.data.map(item => item.embedding);
  }
}
