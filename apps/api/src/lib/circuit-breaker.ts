// KAI-189 follow-up: N consecutive classification failures within a single
// pipeline run (after each message's own withRetry has already exhausted its
// attempts) means the LLM backend itself is down or saturated — continuing to
// fire the rest of the batch at it burns time, concurrency slots, and (on a
// paid provider) money against a service we already know isn't responding.
// Once open, a run stops attempting NEW messages for its remainder; anything
// already in flight is left to finish normally.
export interface CircuitBreaker {
  isOpen(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}

export function createCircuitBreaker(consecutiveFailureThreshold: number): CircuitBreaker {
  let consecutiveFailures = 0;
  let open = false;

  return {
    isOpen: () => open,
    recordSuccess: () => {
      consecutiveFailures = 0;
    },
    recordFailure: () => {
      consecutiveFailures++;
      if (consecutiveFailures >= consecutiveFailureThreshold) open = true;
    },
  };
}
