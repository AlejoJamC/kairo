import { getFlag } from '@kairo/feature-flags';
import { inngest } from '../../lib/inngest.js';
import { supabase } from '../../lib/supabase.js';
import { processDecisionWork, recordWorkflowResult, type DecisionWork } from '../../lib/decision-workflow.js';

export const decisionWorkflows = inngest.createFunction({
  id: 'decision-workflows', retries: 2, concurrency: { limit: 1 },
  triggers: [{ cron: '* * * * *' }, { event: 'decisions/work.requested' }],
}, async ({ step, attempt }) => {
  if (!getFlag('enable_email_knowledge')) return { status: 'disabled' };
  const jobs = await step.run('claim-work', async () => {
    const { data, error } = await supabase.rpc('claim_decision_work', { p_limit: 10 });
    if (error) throw new Error('Decision work claim failed');
    return data as DecisionWork[];
  });
  for (const job of jobs) {
    await step.run(`process-${job.id}`, async () => {
      try { await processDecisionWork(job); }
      catch (error) {
        if (job.ticket_id) await recordWorkflowResult({ accountId:job.account_id,ticketId:job.ticket_id,messageId:job.message_id ?? undefined,
          contract:job.contract,revision:0,status:'failed',key:`failure:${job.id}:${attempt}`,
          result:{ missing:['processing_failed'],execution:'not_executed',retryable:true } });
        throw error;
      }
      const { error } = await supabase.from('decision_work_items').update({ status: 'done' }).eq('id', job.id);
      if (error) throw new Error('Decision completion persistence failed');
    });
  }
  return { completed: jobs.length };
});
