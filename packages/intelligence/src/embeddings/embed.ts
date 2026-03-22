import { createEmbeddingProvider } from '../config/providers';

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = createEmbeddingProvider();
  return provider.embed(text);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const provider = createEmbeddingProvider();
  return provider.embedBatch(texts);
}
