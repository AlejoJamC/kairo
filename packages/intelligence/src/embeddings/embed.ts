import { startObservation } from '@langfuse/tracing';
import { createEmbeddingProvider } from '../config/providers';

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = createEmbeddingProvider();

  // KAI-126: Langfuse generation trace (no-op if LANGFUSE_* env vars are unset).
  // Vectors are never sent as input/output — only shape/size, to keep traces readable.
  const generation = startObservation(
    'embedding',
    { model: provider.model, input: { textChars: text.length } },
    { asType: 'generation' },
  );

  try {
    const vector = await provider.embed(text);
    generation.update({ output: { dimensions: vector.length } });
    return vector;
  } catch (err) {
    generation.update({ level: 'ERROR', statusMessage: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    generation.end();
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const provider = createEmbeddingProvider();

  const generation = startObservation(
    'embedding-batch',
    {
      model: provider.model,
      input: { count: texts.length, totalChars: texts.reduce((sum, t) => sum + t.length, 0) },
    },
    { asType: 'generation' },
  );

  try {
    const vectors = await provider.embedBatch(texts);
    generation.update({ output: { count: vectors.length, dimensions: vectors[0]?.length ?? 0 } });
    return vectors;
  } catch (err) {
    generation.update({ level: 'ERROR', statusMessage: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    generation.end();
  }
}
