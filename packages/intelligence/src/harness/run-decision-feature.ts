// ---------------------------------------------------------------------------
// KAI-61 — the DecisionProvider counterpart of runLlmFeature.
//
// Reuses withGeneration (Langfuse) and the LlmCallRecord/LlmCallLogger
// contract (llm_calls) exactly as they are — a DecisionProvider call gets the
// same one-generation, one-row treatment a CompletionProvider call already
// gets, through the same two pieces of infrastructure, not a new one.
//
// What does not carry over from runLlmFeature: a prompt template, a language,
// a Zod schema for the answer. A decision call has none of those — `state`
// and `questions` are already typed by the caller's own question shape.
// ---------------------------------------------------------------------------

import type { DecisionProvider, DecisionResult } from '../providers/decision';
import { usageDetails, withGeneration } from './generation';
import type { LlmCallLogger, LlmCallRecord } from './run-llm-feature';

export interface DecisionFeatureRequest {
  /** snake_case, the `llm_calls.feature` value and the Langfuse generation name. */
  feature: string;
  provider: DecisionProvider;
  state: unknown;
  questions: unknown;
  context?: { ticketId?: string; accountId?: string; userId?: string };
  logger?: LlmCallLogger;
}

export interface DecisionFeatureResult<TDecision> {
  data: DecisionResult<TDecision>;
  /** The `llm_calls` row id, or null when no logger was given or logging failed. */
  llmCallId: string | null;
}

/** Token usage a DecisionResult carries in `rawMetadata.usage`, when its provider reports one. */
interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
}

function usageOf(result: DecisionResult<unknown>): RawUsage {
  const usage = result.rawMetadata?.['usage'];
  return usage && typeof usage === 'object' ? (usage as RawUsage) : {};
}

/**
 * The single path for a decision call: one Langfuse generation, one
 * `llm_calls` row, same contract `runLlmFeature` gives a completion call.
 * Errors pass through unchanged — `ProviderError` keeps its `retriable` flag.
 * Logging never throws.
 */
export async function runDecisionFeature<TDecision>(
  request: DecisionFeatureRequest,
): Promise<DecisionFeatureResult<TDecision>> {
  const { ticketId, accountId, userId } = request.context ?? {};
  const ids = {
    ...(ticketId ? { ticketId } : {}),
    ...(accountId ? { accountId } : {}),
    ...(userId ? { userId } : {}),
  };
  const requestPayload = JSON.stringify({ state: request.state, questions: request.questions });

  const log = async (record: LlmCallRecord): Promise<string | null> => {
    if (!request.logger) return null;
    try {
      return await request.logger(record);
    } catch (err) {
      console.error(`[decision-feature] ${request.feature} call not logged: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  const start = Date.now();
  return withGeneration(
    {
      name: request.feature,
      model: request.provider.model,
      input: { state: request.state, questions: request.questions },
      metadata: ids,
      context: { ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) },
    },
    async (generation) => {
      let result: DecisionResult<TDecision>;
      try {
        result = await request.provider.decide<TDecision>({ state: request.state, questions: request.questions });
      } catch (err) {
        await log({
          feature: request.feature,
          provider: request.provider.provider,
          model: request.provider.model,
          promptVersion: null,
          promptText: requestPayload,
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

      const usage = usageOf(result);
      generation.update({
        output: result.value,
        ...usageDetails({
          promptTokens: usage.input_tokens ?? null,
          completionTokens: usage.output_tokens ?? null,
        }),
      });

      const llmCallId = await log({
        feature: request.feature,
        provider: result.provider,
        model: result.modelVersion,
        promptVersion: null,
        promptText: requestPayload,
        responseText: JSON.stringify(result.value),
        promptTokens: usage.input_tokens ?? null,
        completionTokens: usage.output_tokens ?? null,
        confidenceScore: result.confidence,
        latencyMs: result.latencyMs,
        errorCode: null,
        errorDetail: null,
        ...ids,
      });

      return { data: result, llmCallId };
    },
  );
}
