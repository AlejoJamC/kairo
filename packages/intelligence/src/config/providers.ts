import type { CompletionProvider, EmbeddingProvider } from '../providers/base';
import { ProviderConfigurationError, ProviderError } from '../providers/base';
import type { DecisionProvider } from '../providers/decision';
import { resolveModelRoute, type ModelRole } from './model-roles';
import { GatewayCompletionProvider } from '../providers/gateway/completion';
import { GatewayDecisionProvider } from '../providers/gateway/decision';
import { GatewayEmbeddingProvider } from '../providers/gateway/embedding';
import { gatewayKey } from '../providers/gateway/client';
import { OllamaEmbeddingProvider } from '../providers/ollama/embedding';
import { JevDecisionProvider } from '../providers/jev/decision';
import { OLLAMA_DEFAULT_BASE_URL } from './constants';
import { findCompletionProvider } from './completion-registry';
import type { CompletionTarget } from './ensemble';

// Re-exported so callers keep one import site for provider configuration.
export { resolveEnsembleTarget, type CompletionTarget } from './ensemble';
export { COMPLETION_PROVIDER_IDS, type CompletionProviderId } from './completion-registry';

/**
 * The completion provider for a classification.
 *
 * With no argument, the one configured by `INTELLIGENCE_PROVIDER` and its model
 * variable, as always. With a target, that provider and model instead — which
 * is how the ensemble asks a second opinion while reusing the same base URL and
 * API key from the environment.
 */
export function createCompletionProvider(target?: CompletionTarget): CompletionProvider {
  if (target) return findCompletionProvider(target.provider).create(process.env, target.model);
  const route = resolveModelRoute('classification');
  if (route.capability !== 'language') throw new ProviderError('Classification uses a decision model; request the decision service', false);
  return findCompletionProvider(route.provider).create(process.env, route.model);
}

/** Transport used by the configured reply model. */
export function resolveTextProviderId(): string {
  return resolveModelRoute('reply').provider;
}

export function createTextProvider(role: 'reply' | 'knowledge_draft' | 'evidence_analysis' | 'classification' = 'reply'): CompletionProvider {
  const route = resolveModelRoute(role);
  if (route.capability !== 'language') throw new ProviderConfigurationError('A language model is required for text generation');
  if (route.provider === 'gateway') return new GatewayCompletionProvider(gatewayKey(), route.model);
  return findCompletionProvider('ollama').create(process.env, route.model);
}

/** The vector columns every embedding is stored in and compared against. */
export const STORED_EMBEDDING_DIMENSIONS = 768;

/**
 * Dimensions of the configured embedding model, the same value for every
 * provider. Vectors from different models are not comparable even at equal
 * dimensions, so changing the model means re-embedding, not only this value.
 */
export function configuredEmbeddingDimensions(env: Record<string, string | undefined> = process.env): number {
  const raw = env['EMBEDDING_DIMENSIONS'] ?? env['OLLAMA_EMBEDDING_DIMENSIONS'];
  const value = raw === undefined ? STORED_EMBEDDING_DIMENSIONS : Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new ProviderConfigurationError('EMBEDDING_DIMENSIONS must be a positive integer');
  return value;
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const route = resolveModelRoute('embedding');
  const dimensions = configuredEmbeddingDimensions();
  return route.provider === 'gateway'
    ? new GatewayEmbeddingProvider(gatewayKey(), route.model, dimensions)
    : new OllamaEmbeddingProvider(process.env['OLLAMA_BASE_URL'] ?? OLLAMA_DEFAULT_BASE_URL, route.model, dimensions);
}

export type DecisionProviderId = 'gateway' | 'jev';

export function createDecisionProvider(
  id: DecisionProviderId = 'gateway',
  role: Extract<ModelRole, 'classification' | 'knowledge_decision' | 'validation'> = 'classification',
): DecisionProvider {
  if (id === 'jev') return new JevDecisionProvider(gatewayKey(), process.env['JEV_MODEL'] ?? 'typesafe-ai/jev');
  const route = resolveModelRoute(role);
  const model = role === 'classification' && route.capability !== 'decision'
    ? process.env['AI_GATEWAY_DECISION_MODEL'] ?? process.env['JEV_MODEL'] ?? 'typesafe-ai/jev'
    : route.model;
  return new GatewayDecisionProvider(gatewayKey(), model);
}
