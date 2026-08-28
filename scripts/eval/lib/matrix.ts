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
}

export const BENCH: BenchModel[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { provider: 'ollama', model: 'muse-glimmer:30b', label: 'muse-glimmer 30b' },
  { provider: 'ollama', model: 'qwen3.8:latest', label: 'qwen 3.8' },
  { provider: 'ollama', model: 'granite4.2:30b', label: 'granite 4.2 30b' },
  { provider: 'ollama', model: 'gemma4:31b', label: 'gemma4 31b' },
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

export const VARIANTS: Variant[] = [
  {
    id: 'onboarding',
    stage: 'onboarding',
    businessContext: false,
    question: 'Tier 1 as it runs today. Baseline for the onboarding column.',
  },
  {
    id: 'onboarding-bc',
    stage: 'onboarding',
    businessContext: true,
    question:
      'Does asking the user for their line of business at sign-up buy enough ' +
      'accuracy to justify the risk it puts on the 60-second first-ticket promise?',
  },
  {
    id: 'backfill',
    stage: 'backfill',
    businessContext: false,
    question: 'Tier 2/3 as they run today. Baseline for the backfill column.',
  },
  {
    id: 'backfill-bc',
    stage: 'backfill',
    businessContext: true,
    question:
      'Here the description costs the user nothing -- it would be derived from ' +
      'the backfill itself. Is the gain worth building that derivation?',
  },
];

/** Directory name for one (model, variant) pair. */
export function cellSlug(m: BenchModel, v: Variant): string {
  const base = slugify(`${m.provider}-${m.model}`);
  const suffix =
    (v.stage === 'onboarding' ? '-onboarding' : '') + (v.businessContext ? '-bc' : '');
  return base + suffix;
}

/** Body rule for a variant, mirroring the production call sites. */
export function bodyRule(v: Variant) {
  return STAGE_BODY_RULES[v.stage];
}

/** Stable key for the execution ledger: one classification, uniquely named. */
export function cellKey(m: BenchModel, v: Variant, emailId: string): string {
  return `${m.provider}/${m.model}|${v.id}|${emailId}`;
}
