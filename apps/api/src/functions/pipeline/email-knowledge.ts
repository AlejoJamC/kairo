import { getFlag } from '@kairo/feature-flags';
import { inngest } from '../../lib/inngest.js';

export const emailKnowledge = inngest.createFunction({
  id: 'email-knowledge', retries: 2,
  concurrency: { limit: 1, key: 'event.data.accountId' },
  triggers: [{ event: 'messages/knowledge.requested' }],
}, async ({ event, step }) => {
  if (!getFlag('enable_email_knowledge')) return { status: 'skipped', reason: 'flag_disabled' };
  await step.sendEvent('wake-decision-work', { name: 'decisions/work.requested', data: event.data });
  return { status: 'queued' };
});
