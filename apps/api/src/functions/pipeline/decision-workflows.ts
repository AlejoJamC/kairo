import { getFlag } from '@kairo/feature-flags';
import { inngest } from '../../lib/inngest.js';
import { supabase } from '../../lib/supabase.js';
import { processDecisionWork, recordWorkflowFailure } from '../../lib/decision-workflow.js';
import { MAX_DECISION_ATTEMPTS, processClaim, type BreakerState, type ClaimedDecisionWork } from '../../lib/decision-work-queue.js';

export const decisionWorkflows = inngest.createFunction({
  id: 'decision-workflows', retries: 2, concurrency: { limit: 1 },
  triggers: [{ cron: '* * * * *' }, { event: 'decisions/work.requested' }],
}, async ({ step }) => {
  if (!getFlag('enable_email_knowledge')) return { status: 'disabled' };
  const jobs = await step.run('claim-work', async () => {
    const { data, error } = await supabase.rpc('claim_decision_work', { p_limit: 10, p_max_attempts: MAX_DECISION_ATTEMPTS });
    if (error) throw new Error('Decision work claim failed');
    return data as ClaimedDecisionWork[];
  });
  const outcomes = await processClaim(jobs, {
    run: (name, fn) => step.run(name, fn) as never,
    process: (work) => processDecisionWork(work),
    markDone: async (work) => {
      const { error } = await supabase.from('decision_work_items').update({ status: 'done' }).eq('id', work.id);
      if (error) throw new Error('Decision completion persistence failed');
    },
    recordFailure: async (work, failure) => {
      await recordWorkflowFailure(work, failure);
    },
    release: async (work, failure) => {
      const { data, error } = await supabase.rpc('release_decision_work', { p_id: work.id, p_error: failure.error,
        p_retriable: failure.retriable, p_consume_attempt: failure.consumeAttempt, p_max_attempts: MAX_DECISION_ATTEMPTS });
      if (error) throw new Error('Decision work release failed');
      return data as string;
    },
    recordOutcome: async (outcome) => {
      const { data, error } = await supabase.rpc('record_decision_outcome', { p_ok: outcome.ok, p_outage_failure: outcome.outageFailure });
      if (error) throw new Error('Decision outcome persistence failed');
      return data as BreakerState;
    },
    returnUnprocessed: async (work) => {
      const { error } = await supabase.rpc('return_decision_work', { p_id: work.id });
      if (error) throw new Error('Decision work return failed');
    },
  });
  return { claimed: jobs.length, outcomes };
});
