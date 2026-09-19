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
  /**
   * Ablation switch. When true the runner withholds the context fields
   * (recipients, thread depth, attachments) so the prompt renders them as
   * unavailable — the same shape production sends today from the call sites
   * that only have subject/body/from. Comparing the two runs measures whether
   * the model uses that context at all.
   */
  withoutContext: boolean;
  /**
   * Which production path this run reproduces. The two tiers feed the
   * classifier differently, so a single number cannot answer "which model
   * serves which moment of the pipeline" — each stage is its own measurement.
   *
   * - 'onboarding' — tier1-fast-path: raw body with the quoted thread intact,
   *   capped at 20,000 chars. Runs once per account over
   *   FAST_PATH_SCAN_SIZE messages; this is the path that produces the very
   *   first ticket.
   * - 'backfill' — tier2/tier3/incremental-sync: stripQuotedThread() first,
   *   then capped at 2,000. This is where the bulk of an account's history
   *   is classified.
   */
  stage: PipelineStage;
  /** Rubric version this run is executing. Filled by the runner at start. */
  promptVersion: string;
  /**
   * Where inference actually happened. Open-weight models are not a local-only
   * category: the same model served from a laptop and from a remote GPU is the
   * same model on very different hardware, and only the endpoint says which
   * one produced a latency figure. Recorded on every row for that reason.
   */
  endpoint: string;
}

/** Ollama's default when OLLAMA_BASE_URL is unset. */
export const LOCAL_OLLAMA = 'http://localhost:11434';

export type PipelineStage = 'onboarding' | 'backfill';

/** Body handling per stage, mirroring the production call sites exactly. */
export const STAGE_BODY_RULES: Record<
  PipelineStage,
  { maxChars: number; stripQuotes: boolean }
> = {
  onboarding: { maxChars: 20_000, stripQuotes: false },
  backfill: { maxChars: 2_000, stripQuotes: true },
};

export function resolveRunLabel(env: NodeJS.ProcessEnv = process.env): RunLabel {
  const provider = env['INTELLIGENCE_PROVIDER'] ?? 'ollama';
  const model =
    provider === 'anthropic'
      ? (env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6')
      : (env['OLLAMA_MODEL'] ?? 'llama3.2');
  const withoutContext = env['EVAL_NO_CONTEXT'] === '1';
  const stage: PipelineStage =
    env['EVAL_STAGE'] === 'onboarding' ? 'onboarding' : 'backfill';

  const endpoint =
    provider === 'anthropic'
      ? 'https://api.anthropic.com'
      : (env['OLLAMA_BASE_URL'] ?? LOCAL_OLLAMA);

  // Every switch that changes what was measured joins the run's identity, so
  // no run can overwrite the one it is meant to be compared against. A remote
  // endpoint gets its own directory: same model, different hardware, and the
  // latency of one says nothing about the other. The default endpoint adds no
  // suffix, so existing run directories keep their names.
  const remote = provider === 'ollama' && endpoint !== LOCAL_OLLAMA;
  const suffix =
    (stage === 'onboarding' ? '-onboarding' : '') +
    (withoutContext ? '-nocontext' : '') +
    (remote ? `-at-${slugify(endpoint.replace(/^https?:\/\//, ''))}` : '');

  return {
    provider,
    model,
    slug: slugify(`${provider}-${model}`) + suffix,
    withoutContext,
    stage,
    promptVersion: 'unknown',
    endpoint,
  };
}

// 'ollama-granite4.1:3b' → 'ollama-granite4.1-3b'
export function slugify(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
