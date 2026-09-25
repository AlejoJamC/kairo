// ---------------------------------------------------------------------------
// KAI-61 — the plumbing for JEV (TypeSafe AI), the technology that proved
// CompletionProvider cannot host every provider shape (see KAI-55).
//
// This file forwards `state`/`questions` and normalizes the reply. It knows
// nothing about tickets, categories or routing — those questions, and how
// their answers are used, belong to whoever calls `decide()`.
// ---------------------------------------------------------------------------

import {
  TypeSafeClient,
  APIError,
  APIConnectionError,
  APITimeoutError,
  RateLimitError,
  InternalServerError,
  type EntryType,
  type Questions,
} from '@typesafe-ai/sdk';

import { ProviderError } from '../base';
import type { DecisionProvider, DecisionResult, TypedDecisionInput } from '../decision';

const DEFAULT_MODEL = 'jev-latest';

interface JevAnswer {
  type: 'noul' | 'choice' | 'score';
  noul?: number;
  confidence?: number;
}

/**
 * Transient per TypeSafe's own error taxonomy. The SDK already retries
 * connection/timeout/429/5xx internally before it throws, so this only
 * classifies what survived those retries — the same contract `ProviderError`
 * carries for every other provider in this package.
 */
function isRetriable(err: unknown): boolean {
  return (
    err instanceof RateLimitError ||
    err instanceof InternalServerError ||
    err instanceof APIConnectionError ||
    err instanceof APITimeoutError
  );
}

/** The call's confidence when it asked exactly one question; null for a multi-question call, where each answer carries its own. */
function singleConfidence(answers: Record<string, JevAnswer>): number | null {
  const keys = Object.keys(answers);
  if (keys.length !== 1) return null;
  const answer = answers[keys[0]!]!;
  return answer.type === 'noul' ? (answer.noul ?? null) : (answer.confidence ?? null);
}

export class JevDecisionProvider implements DecisionProvider {
  public readonly provider = 'jev';
  public readonly model: string;
  private readonly client: TypeSafeClient;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.model = model;
    this.client = new TypeSafeClient({ apiKey, defaultModel: model });
  }

  async decide<TDecision>(input: TypedDecisionInput): Promise<DecisionResult<TDecision>> {
    const start = Date.now();
    try {
      const response = await this.client.systemOne({
        state: input.state as EntryType,
        questions: input.questions as Questions,
      });

      return {
        value: response.answers as TDecision,
        confidence: singleConfidence(response.answers as Record<string, JevAnswer>),
        provider: this.provider,
        modelVersion: response.model,
        latencyMs: Date.now() - start,
        rawMetadata: { usage: response.usage },
      };
    } catch (err) {
      if (err instanceof APIError) {
        throw new ProviderError(`JEV API error: ${err.message}`, isRetriable(err), undefined, { cause: err });
      }
      throw new ProviderError(
        `JEV request failed: ${err instanceof Error ? err.message : String(err)}`,
        isRetriable(err),
        undefined,
        { cause: err },
      );
    }
  }
}
