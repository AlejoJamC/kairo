import { describe, expect, it } from 'bun:test';
import { ProviderConfigurationError, ProviderError } from '@kairo/intelligence';
import { processClaim, settleDecisionWork, type BreakerState, type ClaimDeps, type ClaimedDecisionWork } from './decision-work-queue';

const job = (id: string, attempts = 1): ClaimedDecisionWork => ({
  id, account_id: 'acme-account', ticket_id: 'acme-ticket', message_id: null,
  knowledge_version_id: null, contract: 'incoming_email_decision', dedupe_key: `message:${id}`, attempts,
});

function queue(process: (work: ClaimedDecisionWork) => Promise<void>, breaker: (outcome: { ok: boolean; outageFailure: boolean }) => BreakerState = () => 'closed') {
  const calls = {
    completed: [] as string[], recorded: [] as string[], returned: [] as string[], steps: [] as string[],
    released: [] as { id: string; retriable: boolean; consumeAttempt: boolean; error: string }[],
    outcomes: [] as { ok: boolean; outageFailure: boolean }[],
  };
  const deps: ClaimDeps<ClaimedDecisionWork> = {
    process,
    run: async (name, fn) => { calls.steps.push(name); return fn(); },
    markDone: async (work) => { calls.completed.push(work.id); },
    recordFailure: async (work) => { calls.recorded.push(work.id); },
    release: async (work, failure) => { calls.released.push({ id: work.id, ...failure }); return failure.retriable ? 'pending' : 'failed'; },
    recordOutcome: async (outcome) => { calls.outcomes.push(outcome); return breaker(outcome); },
    returnUnprocessed: async (work) => { calls.returned.push(work.id); },
  };
  return { deps, calls };
}

const outage = () => { throw new ProviderError('Synthetic outage', true); };

describe('settleDecisionWork', () => {
  it('lets the rest of a claim proceed after one item fails', async () => {
    const { deps, calls } = queue(async (work) => { if (work.id === 'first') outage(); });
    const outcomes = await processClaim([job('first'), job('second'), job('third')], deps);
    expect(outcomes).toEqual({ pending: 1, done: 2 });
    expect(calls.completed).toEqual(['second', 'third']);
    expect(calls.released.map(row => row.id)).toEqual(['first']);
    expect(calls.recorded).toEqual(['first']);
  });

  it('sends a failure that retrying cannot fix straight to the failed state, without counting it as an outage', async () => {
    const { deps, calls } = queue(async () => { throw new ProviderError('Synthetic schema mismatch', false); });
    expect((await settleDecisionWork(job('item'), deps)).status).toBe('failed');
    expect(calls.released[0]).toMatchObject({ retriable: false, consumeAttempt: true });
    expect(calls.outcomes).toEqual([{ ok: false, outageFailure: false }]);
  });

  it('does not spend an attempt on a deployment fault and does not count it as an outage', async () => {
    const { deps, calls } = queue(async () => { throw new ProviderConfigurationError('Synthetic missing key'); });
    await settleDecisionWork(job('item'), deps);
    expect(calls.released[0]).toMatchObject({ retriable: true, consumeAttempt: false });
    expect(calls.outcomes).toEqual([{ ok: false, outageFailure: false }]);
  });

  it('counts a retriable provider failure toward the outage threshold and a success against it', async () => {
    const failing = queue(async () => outage());
    await settleDecisionWork(job('a'), failing.deps);
    expect(failing.calls.outcomes).toEqual([{ ok: false, outageFailure: true }]);
    const passing = queue(async () => undefined);
    await settleDecisionWork(job('b'), passing.deps);
    expect(passing.calls.outcomes).toEqual([{ ok: true, outageFailure: false }]);
  });

  it('records only the error name for unexpected errors, never their message', async () => {
    const { deps, calls } = queue(async () => { throw new TypeError('content from a customer email'); });
    await settleDecisionWork(job('item'), deps);
    expect(calls.released[0]?.error).toBe('TypeError');
  });

  it('still releases the item when failure history cannot be written', async () => {
    const { deps, calls } = queue(async () => outage());
    deps.recordFailure = async () => { throw new Error('history down'); };
    expect((await settleDecisionWork(job('item'), deps)).status).toBe('pending');
    expect(calls.released).toHaveLength(1);
  });

  it('does not rerun a settled item when its outcome cannot be recorded', async () => {
    const { deps, calls } = queue(async () => undefined);
    deps.recordOutcome = async () => { throw new Error('outcome log down'); };
    expect(await settleDecisionWork(job('item'), deps)).toEqual({ status: 'done', breaker: 'unknown' });
    expect(calls.completed).toEqual(['item']);
  });

  it('propagates a failed release so the step is retried instead of losing the item', async () => {
    const { deps } = queue(async () => outage());
    deps.release = async () => { throw new Error('Decision work release failed'); };
    await expect(settleDecisionWork(job('item'), deps)).rejects.toThrow('release failed');
  });
});

describe('processClaim under a mass outage', () => {
  it('stops at the item that opens the breaker and returns the rest without running them', async () => {
    let failures = 0;
    const { deps, calls } = queue(async () => outage(), (outcome) => (!outcome.ok && ++failures === 2 ? 'open' : 'closed'));
    const outcomes = await processClaim([job('a'), job('b'), job('c'), job('d')], deps);
    expect(outcomes).toEqual({ pending: 2, returned: 2 });
    expect(calls.released.map(row => row.id)).toEqual(['a', 'b']);
    expect(calls.returned).toEqual(['c', 'd']);
    expect(calls.steps).toEqual(['process-a', 'process-b', 'return-c', 'return-d']);
  });

  it('keeps going while the breaker is only probing', async () => {
    const { deps, calls } = queue(async () => { throw new ProviderError('Synthetic schema mismatch', false); }, () => 'probing');
    await processClaim([job('a'), job('b')], deps);
    expect(calls.returned).toEqual([]);
    expect(calls.released.map(row => row.id)).toEqual(['a', 'b']);
  });
});
