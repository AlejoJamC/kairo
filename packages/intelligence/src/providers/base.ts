import type { z } from 'zod';

export interface CompletionProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  completeJSON<T>(prompt: string, schema: z.ZodSchema<T>, options?: CompletionOptions): Promise<T>;
  completeWithMeta(prompt: string, options?: CompletionOptions): Promise<{ text: string } & CompletionMeta>;
  completeJSONWithMeta<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: CompletionOptions,
  ): Promise<{ data: T } & CompletionMeta>;
  model: string;
}

/** Token usage reported by the underlying LLM provider, when available. */
export interface CompletionUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

/** Observability metadata accompanying a completion call (KAI-110). */
export interface CompletionMeta {
  rawText: string;
  model: string;
  usage: CompletionUsage;
  /**
   * Generation throughput reported by the provider, when it reports one.
   *
   * Wall-clock latency alone cannot tell a slow model from a busy endpoint:
   * two runs sharing one inference server each see their latency roughly
   * double while the model is unchanged. Tokens per second comes from the
   * provider's own generation timer, so a drop in it is a real throughput
   * signal, and comparing it across runs of the same model exposes
   * contention that wall-clock hides. Null when the provider does not
   * report generation timings.
   */
  tokensPerSecond: number | null;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
  model: string;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

/**
 * Node's fetch (undici) throws `TypeError: fetch failed` for every network
 * failure and buries the actual reason (ECONNREFUSED, ENOTFOUND, timeout...)
 * in `error.cause`, which never reaches the console by default. This
 * surfaces that cause so a run fails with "connect ECONNREFUSED
 * 127.0.0.1:11434" instead of the uninformative "fetch failed".
 */
export async function fetchOrThrow(url: string, init: RequestInit, label: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err: unknown) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} request failed: ${cause ?? message}`, { cause: err });
  }
}
