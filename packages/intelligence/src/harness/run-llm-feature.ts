import type { z } from 'zod';

import { createCompletionProvider } from '../config/providers';
import type { PromptLang } from '../classification/prompt';
import type { CompletionOptions, CompletionProvider, CompletionUsage } from '../providers/base';
import { usageDetails, withGeneration } from './generation';
import { extractPromptVersion, fillTemplate, loadPromptTemplate } from './template';

/** One row for `llm_calls`, built by the harness for every call, success or failure. */
export interface LlmCallRecord {
  feature: string;
  model: string;
  promptVersion: string | null;
  promptText: string;
  responseText: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  confidenceScore: number | null;
  latencyMs: number;
  errorCode: string | null;
  errorDetail: string | null;
  ticketId?: string;
  accountId?: string;
  userId?: string;
}

/**
 * Persists a call record and returns its id, or null when it could not.
 * Supplied by the app, because this package has no database client.
 */
export type LlmCallLogger = (record: LlmCallRecord) => Promise<string | null>;

interface LlmFeatureRequestBase {
  /** snake_case, the `llm_calls.feature` value and the Langfuse generation name. */
  feature: string;
  /** Directory under `packages/intelligence/prompts/`. */
  promptId: string;
  /** The tenant's language, resolved by the caller — never guessed from the text. */
  lang: PromptLang;
  /** Placeholder values. A placeholder in the template with no value is an error. */
  vars: Record<string, string>;
  options?: CompletionOptions;
  context?: { ticketId?: string; accountId?: string; userId?: string };
  /** Injection point for tests and for asking a second model. */
  provider?: CompletionProvider;
  logger?: LlmCallLogger;
}

export interface LlmFeatureJsonRequest<T> extends LlmFeatureRequestBase {
  /** The model's answer is validated against this schema by the provider. */
  schema: z.ZodSchema<T>;
  /** Which field of the answer, if any, is stored as `llm_calls.confidence_score`. Recorded only; never decide on it. */
  confidenceOf?: (data: T) => number | null;
}

export interface LlmFeatureResult<D> {
  data: D;
  prompt: string;
  promptVersion: string | null;
  /** The model the provider reports having answered with. */
  model: string;
  usage: CompletionUsage;
  latencyMs: number;
  /** The `llm_calls` row id, or null when no logger was given or logging failed. */
  llmCallId: string | null;
}

/**
 * The single path for a structured LLM call: versioned prompt, schema-validated
 * answer, one Langfuse generation per call, one `llm_calls` row per call.
 *
 * Errors pass through unchanged — `ProviderError` keeps its `retriable` flag for
 * the caller's retry policy, `LlmFeatureError` marks a caller defect. Logging
 * never throws. Retry, concurrency, derivation and gating stay with the caller.
 */
export async function runLlmFeature<T>(request: LlmFeatureJsonRequest<T>): Promise<LlmFeatureResult<T>> {
  return run(request, (provider, prompt, options) =>
    provider.completeJSONWithMeta(prompt, request.schema, options).then(({ data, ...meta }) => ({
      data,
      meta,
      confidence: request.confidenceOf ? request.confidenceOf(data) : null,
    })),
  );
}

/** As {@link runLlmFeature}, for a free-text answer. */
export async function runLlmTextFeature(request: LlmFeatureRequestBase): Promise<LlmFeatureResult<string>> {
  return run(request, (provider, prompt, options) =>
    provider.completeWithMeta(prompt, options).then(({ text, ...meta }) => ({ data: text, meta, confidence: null })),
  );
}

type Call<D> = (
  provider: CompletionProvider,
  prompt: string,
  options: CompletionOptions | undefined,
) => Promise<{
  data: D;
  meta: { rawText: string; model: string; usage: CompletionUsage };
  confidence: number | null;
}>;

async function run<D>(request: LlmFeatureRequestBase, call: Call<D>): Promise<LlmFeatureResult<D>> {
  const template = await loadPromptTemplate(request.promptId, request.lang);
  const promptVersion = extractPromptVersion(template);
  const prompt = fillTemplate(template, request.vars);
  const provider = request.provider ?? createCompletionProvider();
  const { ticketId, accountId, userId } = request.context ?? {};
  const ids = {
    ...(ticketId ? { ticketId } : {}),
    ...(accountId ? { accountId } : {}),
    ...(userId ? { userId } : {}),
  };

  const log = async (record: LlmCallRecord): Promise<string | null> => {
    if (!request.logger) return null;
    try {
      return await request.logger(record);
    } catch (err) {
      console.error(`[llm-feature] ${request.feature} call not logged: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  const start = Date.now();
  return withGeneration(
    {
      name: request.feature,
      model: provider.model,
      input: prompt,
      metadata: { ...(promptVersion ? { promptVersion } : {}), lang: request.lang, ...ids },
      context: { ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) },
    },
    async (generation) => {
      let outcome: Awaited<ReturnType<Call<D>>>;
      try {
        outcome = await call(provider, prompt, request.options);
      } catch (err) {
        await log({
          feature: request.feature,
          model: provider.model,
          promptVersion,
          promptText: prompt,
          responseText: null,
          promptTokens: null,
          completionTokens: null,
          confidenceScore: null,
          latencyMs: Date.now() - start,
          errorCode: 'LLM_ERROR',
          errorDetail: err instanceof Error ? err.message : String(err),
          ...ids,
        });
        throw err;
      }

      const { data, meta, confidence } = outcome;
      const latencyMs = Date.now() - start;
      generation.update({ output: meta.rawText, ...usageDetails(meta.usage) });

      const llmCallId = await log({
        feature: request.feature,
        model: meta.model,
        promptVersion,
        promptText: prompt,
        responseText: meta.rawText,
        promptTokens: meta.usage.promptTokens,
        completionTokens: meta.usage.completionTokens,
        confidenceScore: confidence,
        latencyMs,
        errorCode: null,
        errorDetail: null,
        ...ids,
      });

      return { data, prompt, promptVersion, model: meta.model, usage: meta.usage, latencyMs, llmCallId };
    },
  );
}
