import { Hono } from 'hono';
import { getFlag } from '@kairo/feature-flags';
import { ProviderError } from '@kairo/intelligence';
import { resolveUserAndAccount } from '../../lib/auth.js';
import { AssistantRequestSchema, consultTicketAssistant } from '../../lib/ticket-assistant.js';

export const assistant = new Hono();

/** The assistant without a selected ticket; it exists only while the open-chat flag is on. */
assistant.post('/', async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header('Authorization') ?? '');
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);
  if (!getFlag('enable_ticket_assistant') || !getFlag('enable_assistant_open_chat')) return c.json({ error: 'Assistant is disabled' }, 404);
  const parsed = AssistantRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid assistant request' }, 400);
  try {
    const result = await consultTicketAssistant({ ...ctx, messages: parsed.data.messages, signal: c.req.raw.signal });
    return c.json(result);
  } catch (error) {
    const retryable = !(error instanceof ProviderError) || error.retriable;
    return c.json({ error: 'Assistant unavailable', retryable }, retryable ? 503 : 500);
  }
});
