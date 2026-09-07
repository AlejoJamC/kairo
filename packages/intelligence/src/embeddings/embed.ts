import { startObservation, propagateAttributes } from '@langfuse/tracing';
import { createEmbeddingProvider } from '../config/providers';
import type { LangfuseContext } from '../classification/classify';

export async function generateEmbedding(text: string, context?: LangfuseContext): Promise<number[]> {
  const provider = createEmbeddingProvider();
  const { ticketId, accountId } = context ?? {};

  const run = async () => {
    // KAI-126: Langfuse generation trace (no-op if LANGFUSE_* env vars are unset).
    // Vectors are never sent as input/output — only shape/size, to keep traces readable.
    const generation = startObservation(
      'embedding',
      {
        model: provider.model,
        input: { textChars: text.length },
        metadata: { ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) },
      },
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
  };

  // KAI-189: same per-ticket trace grouping as classifyEmailWithMeta.
  if (ticketId || accountId) {
    return propagateAttributes(
      { ...(ticketId ? { sessionId: ticketId } : {}), ...(accountId ? { metadata: { accountId } } : {}) },
      run,
    );
  }
  return run();
}

export async function generateEmbeddings(texts: string[], context?: LangfuseContext): Promise<number[][]> {
  const provider = createEmbeddingProvider();
  const { ticketId, accountId } = context ?? {};

  const run = async () => {
    const generation = startObservation(
      'embedding-batch',
      {
        model: provider.model,
        input: { count: texts.length, totalChars: texts.reduce((sum, t) => sum + t.length, 0) },
        metadata: { ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) },
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
  };

  if (ticketId || accountId) {
    return propagateAttributes(
      { ...(ticketId ? { sessionId: ticketId } : {}), ...(accountId ? { metadata: { accountId } } : {}) },
      run,
    );
  }
  return run();
}
