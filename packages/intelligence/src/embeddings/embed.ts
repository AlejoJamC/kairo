import { createEmbeddingProvider } from '../config/providers';
import { withGeneration, type LangfuseContext } from '../harness/generation';

function idMetadata(context?: LangfuseContext): Record<string, string> {
  const { ticketId, accountId } = context ?? {};
  return { ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) };
}

export async function generateEmbedding(text: string, context?: LangfuseContext): Promise<number[]> {
  const provider = createEmbeddingProvider();

  // KAI-126: Langfuse generation trace (no-op if LANGFUSE_* env vars are unset),
  // grouped per ticket like classification. Vectors are never sent as
  // input/output — only shape/size, to keep traces readable.
  return withGeneration(
    {
      name: 'embedding',
      model: provider.model,
      input: { textChars: text.length },
      metadata: idMetadata(context),
      ...(context ? { context } : {}),
    },
    async (generation) => {
      const vector = await provider.embed(text);
      generation.update({ output: { dimensions: vector.length } });
      return vector;
    },
  );
}

export async function generateEmbeddings(texts: string[], context?: LangfuseContext): Promise<number[][]> {
  const provider = createEmbeddingProvider();

  return withGeneration(
    {
      name: 'embedding-batch',
      model: provider.model,
      input: { count: texts.length, totalChars: texts.reduce((sum, t) => sum + t.length, 0) },
      metadata: idMetadata(context),
      ...(context ? { context } : {}),
    },
    async (generation) => {
      const vectors = await provider.embedBatch(texts);
      generation.update({ output: { count: vectors.length, dimensions: vectors[0]?.length ?? 0 } });
      return vectors;
    },
  );
}
