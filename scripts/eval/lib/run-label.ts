// Identity of an eval run: which provider/model produced the results.
//
// Mirrors the provider-selection logic in
// packages/intelligence/src/config/providers.ts (createCompletionProvider):
// INTELLIGENCE_PROVIDER picks the provider, OLLAMA_MODEL / ANTHROPIC_MODEL
// pick the model, with the same defaults. The slug names the per-run output
// directory (data/output/<slug>/) so runs from different models never
// overwrite each other.
//
// Note: the slug reflects the *configured* model at launch time; the actual
// model that answered each email is recorded per row in the output CSV
// (`model` column, taken from the provider's response metadata).

export interface RunLabel {
  provider: string;
  model: string;
  slug: string;
}

export function resolveRunLabel(env: NodeJS.ProcessEnv = process.env): RunLabel {
  const provider = env['INTELLIGENCE_PROVIDER'] ?? 'ollama';
  const model =
    provider === 'anthropic'
      ? (env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6')
      : (env['OLLAMA_MODEL'] ?? 'llama3.2');
  return { provider, model, slug: slugify(`${provider}-${model}`) };
}

// 'ollama-granite4.1:3b' → 'ollama-granite4.1-3b'
export function slugify(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
