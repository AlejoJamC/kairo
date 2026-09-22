// ---------------------------------------------------------------------------
// KAI-45 F3 — which second model the classification ensemble asks.
//
// Its own module, apart from providers.ts, so it can be tested as the pure
// function it is: providers.ts is replaced wholesale in the ensemble wiring
// test, and a module mock in bun reaches every file in the same run.
// ---------------------------------------------------------------------------

/** A provider and the model to ask on it. */
export interface CompletionTarget {
  provider: 'ollama' | 'anthropic';
  model: string;
}

/**
 * The second model of the classification ensemble, from `INTELLIGENCE_ENSEMBLE`.
 *
 * Format `provider:model`, split on the first colon only because Ollama model
 * names carry their own (`ollama:qwen3.8:latest`). Unset means no ensemble,
 * which is the behaviour every deployment had before this existed.
 *
 * A malformed value turns the ensemble off with a warning rather than
 * throwing. The second model is an optional opinion on top of a classification
 * that stands on its own, and a typo in its configuration must not stop the
 * primary from answering.
 */
export function resolveEnsembleTarget(
  env: Record<string, string | undefined> = process.env,
): CompletionTarget | null {
  const raw = env['INTELLIGENCE_ENSEMBLE']?.trim();
  if (!raw) return null;

  const colon = raw.indexOf(':');
  const provider = colon === -1 ? raw : raw.slice(0, colon);
  const model = colon === -1 ? '' : raw.slice(colon + 1).trim();

  if ((provider !== 'ollama' && provider !== 'anthropic') || model === '') {
    console.warn(
      `[intelligence] INTELLIGENCE_ENSEMBLE="${raw}" is not "provider:model" with provider ollama|anthropic; ensemble disabled`,
    );
    return null;
  }
  return { provider, model };
}
