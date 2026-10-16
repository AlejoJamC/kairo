import { getFlag } from '@kairo/feature-flags';
import { inngest } from '../../lib/inngest.js';
import { inngestAgentSteps } from '../../lib/agent-steps.js';
import { synthesizeBusiness, type SynthesisScope } from '../../lib/business-synthesis.js';

/** The synthesis block, once per account and scope; each model and tool call is a memoized step. */
export const businessSynthesis = inngest.createFunction({
  id: 'business-synthesis', retries: 2,
  concurrency: { limit: 1, key: 'event.data.accountId' },
  idempotency: 'event.data.accountId + "-" + event.data.scope',
  triggers: [{ event: 'knowledge/synthesis.requested' }],
}, async ({ event, step }) => {
  if (!getFlag('enable_email_knowledge')) return { status: 'disabled' };
  const { accountId, scope } = event.data as { accountId: string; scope: SynthesisScope };
  const result = await synthesizeBusiness({ accountId, scope }, { steps: inngestAgentSteps(step, `synthesis-${scope}`) });
  return { status: 'proposed', ...result };
});
