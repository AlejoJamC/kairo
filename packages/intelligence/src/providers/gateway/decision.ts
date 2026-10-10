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

import { GatewayClient, TYPESAFE_GATEWAY_BASE_URL, gatewayFetch, gatewayProvenance, gatewayProviderOptions, warnIfSystemCredential } from './client';
import { ProviderError } from '../base';
import type { DecisionProvider, DecisionResult, TypedDecisionInput } from '../decision';

const DEFAULT_MODEL = 'typesafe-ai/jev';

interface DecisionAnswer {
  type: 'noul' | 'choice' | 'score';
  noul?: number;
  confidence?: number;
}

function isRetriable(err: unknown): boolean {
  return (
    err instanceof RateLimitError ||
    err instanceof InternalServerError ||
    err instanceof APIConnectionError ||
    err instanceof APITimeoutError
  );
}

/** The call's confidence when it asked exactly one question; null for a multi-question call, where each answer carries its own. */
function singleConfidence(answers: Record<string, DecisionAnswer>): number | null {
  const keys = Object.keys(answers);
  if (keys.length !== 1) return null;
  const answer = answers[keys[0]!]!;
  return answer.type === 'noul' ? null : (answer.confidence ?? null);
}

export class GatewayDecisionProvider implements DecisionProvider {
  public readonly provider: string = 'gateway';
  public readonly model: string;
  private readonly client: TypeSafeClient;
  private readonly gateway: GatewayClient;

  constructor(apiKey: string, model: string = DEFAULT_MODEL, transport: typeof fetch = gatewayFetch) {
    this.model = model === 'jev-latest' ? DEFAULT_MODEL : model;
    this.gateway = new GatewayClient(apiKey, transport);
    this.client = new TypeSafeClient({ apiKey, defaultModel: this.model, baseURL: TYPESAFE_GATEWAY_BASE_URL, fetch: transport, retry: { maxRetries: 0 }, logLevel: 'error', timeout: 30_000 });
  }

  async decide<TDecision>(input: TypedDecisionInput): Promise<DecisionResult<TDecision>> {
    const start = Date.now();
    try {
      await this.gateway.requireModel(this.model, 'decision');
      const request = {
        state: input.state as EntryType,
        questions: input.questions as Questions,
        providerOptions: gatewayProviderOptions(this.model),
      };
      const response = await this.client.systemOne(request, { signal: input.signal });

      const provenance = gatewayProvenance(
        (response as unknown as { provider_metadata?: unknown }).provider_metadata, response.model,
      );
      warnIfSystemCredential(provenance);
      return {
        value: response.answers as TDecision,
        confidence: singleConfidence(response.answers as Record<string, DecisionAnswer>),
        provider: this.provider,
        modelVersion: provenance.model,
        latencyMs: Date.now() - start,
        rawMetadata: { usage: response.usage, route: 'gateway', costUsd: provenance.costUsd,
          inferenceProvider: provenance.inferenceProvider, credentialType: provenance.credentialType },
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof APIError) {
        throw new ProviderError(`Decision Gateway request failed (HTTP ${err.status})`, isRetriable(err), err instanceof RateLimitError ? err.retryAfterMs : undefined);
      }
      throw new ProviderError(
        'Decision Gateway request failed',
        isRetriable(err),
        undefined,
      );
    }
  }
}
