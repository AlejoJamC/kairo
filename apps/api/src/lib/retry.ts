import { ProviderError } from "@kairo/intelligence";
import type { createSemaphore } from "./semaphore.js";

type Semaphore = ReturnType<typeof createSemaphore>;

export interface RetryPolicy {
  /** Total attempts, including the first — not additional retries on top of it. */
  maxAttempts: number;
  /** Delay before attempt N+2, indexed by attempt number (0 = delay before the 2nd attempt). */
  backoffMs: number[];
}

// tier1/tier2/tier3 all fan out classifyEmailWithMeta over a batch under the
// same FAST_PATH_LLM_CONCURRENCY semaphore — one shared retry policy for all
// three so they can't drift from each other.
export const CLASSIFICATION_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  backoffMs: [1000, 4000, 16000],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` under `semaphore`, retrying on a retriable ProviderError up to
 * `policy.maxAttempts` times with exponential backoff.
 *
 * The semaphore slot is released BEFORE sleeping and re-acquired for the next
 * attempt — holding it idle through a multi-second backoff would eat into the
 * exact concurrency budget the semaphore exists to protect. A non-retriable
 * error (bad request, schema mismatch — see ProviderError) is never retried:
 * it will fail identically every time, so retrying only delays surfacing a
 * real bug and burns a slot another message could have used.
 */
export async function withRetry<T>(
  semaphore: Semaphore,
  fn: () => Promise<T>,
  policy: RetryPolicy = CLASSIFICATION_RETRY_POLICY,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const release = await semaphore.acquire();
    try {
      const result = await fn();
      release();
      return result;
    } catch (err) {
      release();
      const isRetriable = err instanceof ProviderError && err.retriable;
      const isLastAttempt = attempt === policy.maxAttempts - 1;
      if (!isRetriable || isLastAttempt) {
        throw err;
      }
      const explicitDelay = err instanceof ProviderError ? err.retryAfterMs : undefined;
      const delay = explicitDelay ?? policy.backoffMs[Math.min(attempt, policy.backoffMs.length - 1)];
      await sleep(delay);
    }
  }
}
