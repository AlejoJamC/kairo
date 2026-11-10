import { expect, test } from 'bun:test';
import { memoryDb } from '../test-support/memory-db';
import { ASSISTANT_QUESTION_CATALOG } from './assistant-question-catalog';
import type { TicketAssistantDeps } from './ticket-assistant';

// A real local model answers; only storage and retrieval are synthetic.
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
const enabled = process.env['RUN_OLLAMA_ASSISTANT_TESTS'] === '1';

const identity = { accountId: 'acme-account', userId: 'acme-agent' };
const ticketId = 'acme-ticket';
const ticket = { id: ticketId, subject: 'Cannot export', body_plain: 'The export button does nothing. Please help.',
  conversation_id: 'acme-conversation', from_email: 'client@outside.com', to_email: 'support@acme.com', ticket_type: 'support',
  priority: 'P2', category: 'product', status: 'open', model_verdict: null, abstain: false,
  ticket_number: 6, created_at: '2026-11-04T23:15:26Z', received_at: '2026-05-15T22:03:17Z' };
const article = { id: 'acme-article', title: 'Repair export configuration',
  content: 'Open Settings, enable exports, then retry the export button.', tags: [], similarity: 0.9 };

const AGENT = '11111111-1111-4111-8111-111111111111';
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const sender = 'client@outside.com';
const ticketRow = (id: string, number: number, overrides: Record<string, unknown>) => ({ ...ticket, id, ticket_number: number, account_id: identity.accountId,
  assigned_to: AGENT, group_id: null, ...overrides });
const db = memoryDb({
  tickets: [
    ticketRow(ticketId, 6, {}),
    ticketRow('acme-ticket-7', 7, { status: 'in_progress', priority: 'P1', created_at: daysAgo(20) }),
    ticketRow('acme-ticket-8', 8, { status: 'resolved', created_at: daysAgo(40), resolved_at: daysAgo(30) }),
    ticketRow('acme-ticket-9', 9, { from_email: 'other@outside.com', priority: 'P1', assigned_to: null, created_at: daysAgo(1) }),
    ticketRow('acme-ticket-10', 10, { from_email: 'other@outside.com', priority: 'P3', created_at: daysAgo(2) }),
  ],
  messages: [{ account_id: identity.accountId, conversation_id: 'acme-conversation', direction: 'inbound', body_plain: ticket.body_plain, received_at: '2026-05-15T22:03:17Z' }],
  profiles: [{ id: AGENT, name: 'Ana Agent' }],
  ticket_lifecycle_timeline: [
    { account_id: identity.accountId, ticket_id: ticketId, occurred_at: '2026-06-21T10:00:00Z', kind: 'state_change', actor_type: 'human', actor_ref: AGENT, detail: 'open → in_progress' },
    { account_id: identity.accountId, ticket_id: ticketId, occurred_at: '2026-06-20T22:07:31Z', kind: 'message', actor_type: 'customer', actor_ref: 'Client', detail: 'inbound' },
  ],
  ticket_notes: [{ account_id: identity.accountId, ticket_id: ticketId, author_id: AGENT, body: 'Check the export logs before replying', created_at: '2026-06-21T11:00:00Z' }],
  ticket_tags: [{ ticket_id: ticketId, tag: 'billing-vip' }],
  ticket_followers: [],
  escalations: [{ ticket_id: ticketId, escalated_to_level: 2, escalated_by: AGENT, reason: 'Payment blocked', created_at: '2026-06-21T12:00:00Z' }],
  csat_events: [],
  clients: [{ id: 'acme-client', account_id: identity.accountId, name: 'Acme Customer', plan_type: 'Enterprise', sla_level: 'gold', telephone: null, authorized_emails: [sender], contact_persons: [] }],
  draft_contact: [],
  tenant_sla_rules: [{ id: 'rule', account_id: identity.accountId, ticket_type: 'support', plan_tier: 'enterprise', response_hours: 4, resolution_hours: 24 }],
  ticket_priority_sla_config: [],
});
const deps: TicketAssistantDeps = {
  db: db as unknown as NonNullable<TicketAssistantDeps['db']>,
  resolveContext: async () => ({ language: 'en', tenantMailbox: 'support@acme.com', tenantMailboxes: ['support@acme.com'],
    businessContext: 'Acme provides customer support software.' }) as never,
  retrieveContext: async () => ({ kbArticles: [article], resolvedCases: [], degraded: [] }),
  tenantSettings: async () => ({ businessContext: 'Acme provides customer support software.', language: 'en' }) as never,
  approvedKnowledge: async () => [],
  approvedLearnings: async () => [],
  logger: async () => null,
};

async function ask(content: string, withTicket: boolean) {
  const { consultTicketAssistant } = await import('./ticket-assistant');
  const result = await consultTicketAssistant({ ...identity, timeZone: 'Europe/Madrid', ...(withTicket ? { ticketId } : {}), messages: [{ role: 'user', content }] }, deps);
  expect(result).not.toBeNull();
  return result!;
}
const mentionsCapital = (text: string) => /bogot/i.test(text);

test.skipIf(!enabled)('local model: a ticket question reads the ticket and its knowledge', async () => {
  const result = await ask('How do I fix this ticket?', true);
  expect(result.operations.some((operation) => operation.tool === 'inspect_ticket' && operation.result.status === 'completed')).toBe(true);
  expect(result.text).toMatch(/export/i);
}, 300_000);

test.skipIf(!enabled)('local model: without a ticket it reads account memory', async () => {
  const result = await ask('What does our knowledge say about the export button?', false);
  expect(result.operations.some((operation) => operation.tool === 'read_account_memory')).toBe(true);
  expect(result.operations.every((operation) => !['inspect_ticket', 'draft_reply'].includes(operation.tool))).toBe(true);
}, 300_000);

test.skipIf(!enabled)('local model: an unrelated question is declined, with and without a ticket', async () => {
  for (const withTicket of [true, false]) {
    const result = await ask('What is the capital of Colombia?', withTicket);
    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(mentionsCapital(result.text)).toBe(false);
  }
}, 600_000);

for (const entry of ASSISTANT_QUESTION_CATALOG) {
  for (const withTicket of entry.scope === 'both' ? [true, false] : entry.scope === 'ticket' ? [true] : [false]) {
    test.skipIf(!enabled)(`catalog (${withTicket ? 'ticket' : 'account'}): ${entry.question}`, async () => {
      const result = await ask(entry.question, withTicket);
      expect(result.operations.some((operation) => [entry.tool].flat().includes(operation.tool) && operation.result.status === 'completed')).toBe(true);
      if (entry.answer) expect(result.text).toMatch(entry.answer);
    // A local model is not deterministic: a question passes when one of its attempts uses the tool and gives the answer.
    }, { timeout: 300_000, retry: 2 });
  }
}
