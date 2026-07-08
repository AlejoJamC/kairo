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
