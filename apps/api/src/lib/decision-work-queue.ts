import { ProviderConfigurationError, ProviderError } from '@kairo/intelligence';

/**
 * The original execution plus five retries, at 1 min, 5 min, 15 min, 3 h and
 * 6 h after the first failure. The offsets live in `decision_retry_offset`.
 */
export const MAX_DECISION_ATTEMPTS = 6;

export interface ClaimedDecisionWork {
  id: string; account_id: string; ticket_id: string | null; message_id: string | null;
  knowledge_version_id: string | null; contract: string; dedupe_key: string; attempts: number;
}

/** `open` means the queue-wide outage breaker stopped claiming; the rest of the claim goes back untouched. */
export type BreakerState = 'closed' | 'open' | 'probing' | 'unknown';

export interface DecisionWorkQueueDeps<T extends ClaimedDecisionWork> {
  process: (job: T) => Promise<void>;
  markDone: (job: T) => Promise<void>;
  /** Puts the item back on its retry ladder, or into the failed state; returns the resulting status. */
  release: (job: T, failure: { error: string; retriable: boolean; consumeAttempt: boolean }) => Promise<string>;
  recordFailure: (job: T, failure: { error: string; retriable: boolean }) => Promise<void>;
  recordOutcome: (outcome: { ok: boolean; outageFailure: boolean }) => Promise<BreakerState>;
}

export interface ClaimDeps<T extends ClaimedDecisionWork> extends DecisionWorkQueueDeps<T> {
  /** Durable execution of one named unit (Inngest `step.run` in production). */
  run: <R>(name: string, fn: () => Promise<R>) => Promise<R>;
  returnUnprocessed: (job: T) => Promise<void>;
}

/** Error names and provider messages only: other messages can carry model output or email content. */
function describe(error: unknown): string {
  if (error instanceof ProviderError) return `${error.name}: ${error.message}`;
  return error instanceof Error ? error.name : 'UnknownError';
}

/** Only a retriable provider or network failure points at an outage; data and configuration faults do not. */
function isOutageFailure(error: unknown): boolean {
  return error instanceof ProviderError && error.retriable && !(error instanceof ProviderConfigurationError);
}

async function report<T extends ClaimedDecisionWork>(deps: DecisionWorkQueueDeps<T>, outcome: { ok: boolean; outageFailure: boolean }): Promise<BreakerState> {
  // The item is already settled: a lost outcome must not make the step retry and run the item again.
  try { return await deps.recordOutcome(outcome); }
  catch { console.warn('[decision-work] Outcome not recorded'); return 'unknown'; }
}

/**
 * Settles one claimed item without throwing for a processing failure, so one
 * failing item never holds back the rest of the claim. Only a failure to
 * release the item propagates: then the lease expiry is the remaining safeguard.
 */
export async function settleDecisionWork<T extends ClaimedDecisionWork>(job: T, deps: DecisionWorkQueueDeps<T>): Promise<{ status: string; breaker: BreakerState }> {
  try {
    await deps.process(job);
  } catch (error) {
    const failure = {
      error: describe(error),
      retriable: !(error instanceof ProviderError) || error.retriable,
      consumeAttempt: !(error instanceof ProviderConfigurationError),
    };
    try {
      await deps.recordFailure(job, failure);
    } catch {
      console.warn('[decision-work] Failure history unavailable');
    }
    const status = await deps.release(job, failure);
    return { status, breaker: await report(deps, { ok: false, outageFailure: isOutageFailure(error) }) };
  }
  await deps.markDone(job);
  return { status: 'done', breaker: await report(deps, { ok: true, outageFailure: false }) };
}

/** Processes a claim in order and stops as soon as the outage breaker opens, returning what was not run. */
export async function processClaim<T extends ClaimedDecisionWork>(jobs: T[], deps: ClaimDeps<T>): Promise<Record<string, number>> {
  const outcomes: Record<string, number> = {};
  for (const [index, job] of jobs.entries()) {
    const { status, breaker } = await deps.run(`process-${job.id}`, () => settleDecisionWork(job, deps));
    outcomes[status] = (outcomes[status] ?? 0) + 1;
    if (breaker !== 'open') continue;
    for (const pending of jobs.slice(index + 1)) {
      await deps.run(`return-${pending.id}`, () => deps.returnUnprocessed(pending));
      outcomes['returned'] = (outcomes['returned'] ?? 0) + 1;
    }
    break;
  }
  return outcomes;
}
