// ---------------------------------------------------------------------------
// KAI-61 — every completion provider Kairo can execute, in one place.
//
// This used to be a Zod schema in providers.ts that grew a field per
// provider, plus a duplicate of the provider enum in ensemble.ts. Adding a
// provider was editing an object that already knew about every other one, in
// two files. This registry is the single source of truth for "which
// providers exist"; providers.ts resolves one, ensemble.ts validates a name
// against the same list, and neither hardcodes the other one's enum.
// ---------------------------------------------------------------------------

import type { CompletionProvider } from '../providers/base';
import { OllamaCompletionProvider } from '../providers/ollama/completion';
import { AnthropicCompletionProvider } from '../providers/anthropic/completion';
import { OLLAMA_DEFAULT_BASE_URL } from './constants';

type Env = Record<string, string | undefined>;

interface CompletionProviderEntry {
  id: string;
  create(env: Env, modelOverride?: string): CompletionProvider;
}

export const COMPLETION_PROVIDERS = [
  {
    id: 'ollama',
    create: (env, modelOverride) =>
      new OllamaCompletionProvider(
        env['OLLAMA_BASE_URL'] ?? OLLAMA_DEFAULT_BASE_URL,
        modelOverride ?? env['OLLAMA_MODEL'] ?? 'llama3.2',
      ),
  },
  {
    id: 'anthropic',
    create: (env, modelOverride) => {
      const apiKey = env['ANTHROPIC_API_KEY'];
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY required when INTELLIGENCE_PROVIDER=anthropic');
      return new AnthropicCompletionProvider(apiKey, modelOverride ?? env['ANTHROPIC_MODEL']);
    },
  },
] as const satisfies readonly CompletionProviderEntry[];

export type CompletionProviderId = (typeof COMPLETION_PROVIDERS)[number]['id'];

export const COMPLETION_PROVIDER_IDS: readonly CompletionProviderId[] = COMPLETION_PROVIDERS.map(
  (p) => p.id,
);

export function isCompletionProviderId(value: string): value is CompletionProviderId {
  return (COMPLETION_PROVIDER_IDS as readonly string[]).includes(value);
}

export function findCompletionProvider(id: string): CompletionProviderEntry {
  const entry = COMPLETION_PROVIDERS.find((p) => p.id === id);
  if (!entry) {
    throw new Error(`Unknown completion provider "${id}". Known providers: ${COMPLETION_PROVIDER_IDS.join(', ')}`);
  }
  return entry;
}
