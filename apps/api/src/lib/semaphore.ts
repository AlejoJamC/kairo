// A minimal counting semaphore — gates how many concurrent LLM calls are in
// flight WITHIN a single pipeline run (see FAST_PATH_LLM_CONCURRENCY).
// Shared by tier1/tier2/tier3, all of which fan out classifyEmailWithMeta
// calls over a batch of messages. Deliberately not a dependency (p-limit et
// al.): this is the entire need.
export function createSemaphore(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function release(): void {
    active--;
    const next = queue.shift();
    if (next) next();
  }

  return {
    acquire(): Promise<() => void> {
      return new Promise((resolve) => {
        const tryAcquire = () => {
          active++;
          resolve(release);
        };
        if (active < limit) tryAcquire();
        else queue.push(tryAcquire);
      });
    },
  };
}
