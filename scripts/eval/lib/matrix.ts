import { slugify, STAGE_BODY_RULES, type PipelineStage } from './run-label';

/**
 * The model bench, in execution order.
 *
 * Fastest first: a misconfiguration then fails in minutes instead of hours,
 * and the cheap results are on disk before the expensive ones start. Changing
 * a model mid-run forces Ollama to reload, so a model is always finished
 * before the next one begins.
 *
 * Models that did not beat the majority-class baseline are not here. A
 * classifier that carries no information about the email it read is not a
 * candidate, whatever its latency.
 */
export interface BenchModel {
  provider: 'anthropic' | 'ollama';
  model: string;
  label: string;
  /**
   * The stages this model is measured on. Not every model is a candidate for
   * every stage, and a cell for a stage a model will never serve costs minutes
   * per email to produce a number nobody can act on.
   */
  stages: PipelineStage[];
}

export const BENCH: BenchModel[] = [
  // Onboarding only. Tier 1 is one scan per signup; backfill is the whole
  // history and then every message that arrives, forever.
  { provider: 'anthropic', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', stages: ['onboarding'] },
  // Backfill only: did not clear 0.80 on the previous matrix, and onboarding
  // decides on accuracy against the latency of a single call.
  { provider: 'ollama', model: 'muse-glimmer:30b', label: 'muse-glimmer 30b', stages: ['backfill'] },
  // Cleared 0.80: candidates for both stages.
  { provider: 'ollama', model: 'qwen3.8:latest', label: 'qwen 3.8', stages: ['onboarding', 'backfill'] },
  { provider: 'ollama', model: 'granite4.2:30b', label: 'granite 4.2 30b', stages: ['onboarding', 'backfill'] },
  // Backfill only, same reason as muse-glimmer.
  { provider: 'ollama', model: 'gemma4:31b', label: 'gemma4 31b', stages: ['backfill'] },
];

/**
 * One cell of the matrix: a way of feeding the classifier that some part of
 * production either does today or is being considered.
 *
 * `tenantMailbox` is not a variable — production sends it from all four
 * ingestion paths, so every variant sends it. The context fields (to, cc,
 * thread depth, attachments) are always full for the same reason. What varies
 * is the pipeline stage and whether the tenant's line of business is known.
 */
export interface Variant {
  id: string;
  stage: PipelineStage;
  businessContext: boolean;
  /** Why this cell exists. Printed at run start so the matrix explains itself. */
  question: string;
}

// One cell per stage, because each stage now has exactly one condition. Both
// business-context variants were questions, both were answered on the KAI-93
// bench, and both answers are enforced in apps/api/src/lib/classifier-input.ts:
// `onboarding` does not read the column, `backfill` always does.
//
// A settled question is not an experiment. Re-measuring a delta that has
// already been accepted spends compute to reconfirm a decision instead of
// informing one, and an empty column is a task in another domain, not a
// condition this bench exists to observe.
export const VARIANTS: Variant[] = [
  {
    id: 'onboarding',
    stage: 'onboarding',
    businessContext: false,
    question:
      'Tier 1, and the only condition it has: raw body, quoted thread intact, ' +
      'no business context. The stage is settled, so it is measured once.',
  },
  {
    id: 'backfill',
    stage: 'backfill',
    businessContext: true,
    question:
      'Tier 2/3, incremental-sync, the poll and the reclassify endpoints, with ' +
      'the tenant context they are wired to carry.',
  },
];

/**
 * Which stages a model is measured on is a property of the model row, so there
 * is one place to look and one place to change it. These are views over that,
 * not a second list that could drift away from it.
 */
export const ONBOARDING_BENCH: BenchModel[] = BENCH.filter((m) =>
  m.stages.includes('onboarding'),
);

/** The variants a given model is measured on. */
export function variantsFor(m: BenchModel): Variant[] {
  return VARIANTS.filter((v) => m.stages.includes(v.stage));
}

/** Total cells for one pass over the corpus. */
export function totalCells(emails: number): number {
  return BENCH.reduce((n, m) => n + variantsFor(m).length, 0) * emails;
}

/** Directory name for one (model, variant) pair. */
export function cellSlug(m: BenchModel, v: Variant): string {
  const base = slugify(`${m.provider}-${m.model}`);
  // One cell per stage, so the stage alone names the directory.
  return base + (v.stage === 'onboarding' ? '-onboarding' : '');
}

/** Body rule for a variant, mirroring the production call sites. */
export function bodyRule(v: Variant) {
  return STAGE_BODY_RULES[v.stage];
}

/** Stable key for the execution ledger: one classification, uniquely named. */
export function cellKey(m: BenchModel, v: Variant, emailId: string): string {
  return `${m.provider}/${m.model}|${v.id}|${emailId}`;
}
