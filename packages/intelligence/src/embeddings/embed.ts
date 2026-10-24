import { createEmbeddingProvider } from '../config/providers';
import { withGeneration, type LangfuseContext } from '../harness/generation';

export async function generateEmbedding(text: string, _context?: LangfuseContext): Promise<number[]> {
  const provider = createEmbeddingProvider();

  return withGeneration(
    {
      name: 'embedding',
      model: provider.model,
      input: { textChars: text.length },
      failureMessage: 'Embedding generation failed',
    },
    async (generation) => {
      const vector = await provider.embed(text);
      generation.update({ output: { dimensions: vector.length } });
      return vector;
    },
  );
}

export async function generateEmbeddings(texts: string[], _context?: LangfuseContext): Promise<number[][]> {
  const provider = createEmbeddingProvider();

  return withGeneration(
    {
      name: 'embedding-batch',
      model: provider.model,
      input: { count: texts.length, totalChars: texts.reduce((sum, t) => sum + t.length, 0) },
      failureMessage: 'Embedding generation failed',
    },
    async (generation) => {
      const vectors = await provider.embedBatch(texts);
      generation.update({ output: { count: vectors.length, dimensions: vectors[0]?.length ?? 0 } });
      return vectors;
    },
  );
}
