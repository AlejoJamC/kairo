export interface RetryOptions {
  /** Total tries, the first one included. */
  attempts?: number;
  /** Wait before the second try; each later wait doubles. */
  baseMs?: number;
  /** No wait is longer than this. */
  maxMs?: number;
  /** Fraction of each wait added at random, so clients that failed together do not retry together. */
  jitter?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** Waits before retry number `retry` (1 for the first retry), without jitter. */
export function backoffDelay(retry: number, baseMs: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** (retry - 1));
}

/**
 * Runs `task` until it resolves, retrying a thrown error with exponential backoff and jitter. The
 * last error is thrown once the tries are spent, so the caller decides what a failure means.
 */
export async function retryWithBackoff<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 4, baseMs = 1000, maxMs = 15_000, jitter = 0.2, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), random = Math.random } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(backoffDelay(attempt, baseMs, maxMs) * (1 + jitter * random()));
    }
  }
  throw lastError;
}
