import type { z } from 'zod';

/**
 * Thrown by CompletionProvider/EmbeddingProvider implementations instead of a
 * plain Error, so callers can decide whether retrying is ever going to help.
 *
 * `retriable: false` covers anything retrying can't fix: a malformed request
 * (4xx), an auth failure, a response that fails schema validation — these
 * indicate a bug on our side or a permanent rejection, and retrying just
 * delays finding that out. `retriable: true` covers transient conditions:
 * network failures/timeouts, 5xx, rate limiting (429) — and may carry
 * `retryAfterMs` when the provider tells us exactly how long to wait
 * (Anthropic's `retry-after` header), which callers should prefer over their
 * own backoff schedule.
 */
export class ProviderError extends Error {
  readonly retriable: boolean;
  readonly retryAfterMs?: number;

  constructor(message: string, retriable: boolean, retryAfterMs?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderError';
    this.retriable = retriable;
    this.retryAfterMs = retryAfterMs;
  }
}

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
    // Network failures (connection refused, DNS, timeout) are always
    // transient — retriable regardless of provider.
    throw new ProviderError(`${label} request failed: ${cause ?? message}`, true, undefined, { cause: err });
  }
}
