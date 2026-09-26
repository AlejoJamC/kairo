// ---------------------------------------------------------------------------
// KAI-61 — where any provider Kairo executes gets resolved from configuration.
//
// Completion and embedding used to each carry a Zod schema enumerating every
// provider inline, so adding one meant editing a schema that already knew
// about the others. Completion now resolves from completion-registry.ts, the
// single list ensemble.ts validates against too. Embedding has only ever had
// two providers and nothing outside this file needs its id, so its registry
// stays here — the fix was removing the shared schema, not the file.
// ---------------------------------------------------------------------------

import type { CompletionProvider, EmbeddingProvider } from '../providers/base';
import type { DecisionProvider } from '../providers/decision';
import { OllamaEmbeddingProvider } from '../providers/ollama/embedding';
import { VoyageEmbeddingProvider } from '../providers/voyage/embedding';
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
  const id = target?.provider ?? process.env['INTELLIGENCE_PROVIDER'] ?? 'ollama';
  return findCompletionProvider(id).create(process.env, target?.model);
}

type Env = Record<string, string | undefined>;

interface EmbeddingProviderEntry {
  id: string;
  create(env: Env): EmbeddingProvider;
}

const EMBEDDING_PROVIDERS = [
  {
    id: 'ollama',
    create: (env) =>
      new OllamaEmbeddingProvider(
        env['OLLAMA_BASE_URL'] ?? OLLAMA_DEFAULT_BASE_URL,
        env['OLLAMA_EMBEDDING_MODEL'] ?? 'nomic-embed-text',
        env['OLLAMA_EMBEDDING_DIMENSIONS'] ? Number(env['OLLAMA_EMBEDDING_DIMENSIONS']) : 384,
      ),
  },
  {
    id: 'voyage',
    create: (env) => {
      const apiKey = env['VOYAGE_API_KEY'];
      if (!apiKey) throw new Error('VOYAGE_API_KEY required when EMBEDDING_PROVIDER=voyage');
      return new VoyageEmbeddingProvider(apiKey);
    },
  },
] as const satisfies readonly EmbeddingProviderEntry[];

export function createEmbeddingProvider(): EmbeddingProvider {
  const id = process.env['EMBEDDING_PROVIDER'] ?? 'ollama';
  const entry = EMBEDDING_PROVIDERS.find((p) => p.id === id);
  if (!entry) {
    throw new Error(
      `Unknown embedding provider "${id}". Known providers: ${EMBEDDING_PROVIDERS.map((p) => p.id).join(', ')}`,
    );
  }
  return entry.create(process.env);
}

interface DecisionProviderEntry {
  id: string;
  create(env: Env): DecisionProvider;
}

// One entry today. The point of this registry is not the count — it is that
// JEV, the technology that proved CompletionProvider cannot host every
// provider shape (KAI-55), plugs in the same way a second decision provider
// would, with no switch to extend.
const DECISION_PROVIDERS = [
  {
    id: 'jev',
    create: (env) => {
      const apiKey = env['TYPESAFE_API_KEY'];
      if (!apiKey) throw new Error('TYPESAFE_API_KEY required to use the jev decision provider');
      return new JevDecisionProvider(apiKey, env['JEV_MODEL']);
    },
  },
] as const satisfies readonly DecisionProviderEntry[];

export type DecisionProviderId = (typeof DECISION_PROVIDERS)[number]['id'];

/** The decision provider named by `id` — "jev" is the only one today. */
export function createDecisionProvider(id: DecisionProviderId = 'jev'): DecisionProvider {
  const entry = DECISION_PROVIDERS.find((p) => p.id === id);
  if (!entry) {
    throw new Error(
      `Unknown decision provider "${id}". Known providers: ${DECISION_PROVIDERS.map((p) => p.id).join(', ')}`,
    );
  }
  return entry.create(process.env);
}
