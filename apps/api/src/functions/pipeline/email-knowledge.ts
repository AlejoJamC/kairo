import { getFlag } from '@kairo/feature-flags';
import { inngest } from '../../lib/inngest.js';
import { proposeEmailKnowledge } from '../../lib/email-knowledge.js';

export const emailKnowledge = inngest.createFunction({
  id: 'email-knowledge', retries: 2,
  concurrency: { limit: 1, key: 'event.data.accountId' },
  triggers: [{ event: 'messages/knowledge.requested' }],
}, async ({ event, step }) => {
  if (!getFlag('enable_email_knowledge')) return { status: 'skipped', reason: 'flag_disabled' };
  const input = event.data as { accountId: string; ticketId: string; messageId: string };
  return step.run('propose-email-knowledge', () => proposeEmailKnowledge(input));
});
