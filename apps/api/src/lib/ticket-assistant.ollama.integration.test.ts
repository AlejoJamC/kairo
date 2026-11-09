import { expect, test } from 'bun:test';
import type { TicketAssistantDeps } from './ticket-assistant';

// A real local model answers; only storage and retrieval are synthetic.
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
const enabled = process.env['RUN_OLLAMA_ASSISTANT_TESTS'] === '1';

const identity = { accountId: 'acme-account', userId: 'acme-agent' };
const ticketId = 'acme-ticket';
const ticket = { id: ticketId, subject: 'Cannot export', body_plain: 'The export button does nothing. Please help.',
  conversation_id: 'acme-conversation', from_email: 'client@outside.com', to_email: 'support@acme.com', ticket_type: 'support',
  priority: 'P2', category: 'product', status: 'open', model_verdict: null, abstain: false };
const article = { id: 'acme-article', title: 'Repair export configuration',
  content: 'Open Settings, enable exports, then retry the export button.', tags: [], similarity: 0.9 };

interface Query { select(): Query; eq(): Query; order(): Query; limit(): Query;
  maybeSingle(): Promise<{ data: unknown; error: null }>; then<T>(resolve: (value: { data: unknown[]; error: null }) => T): Promise<T> }
const db = {
  from(table: string): Query {
    const rows = table === 'tickets' ? [ticket] : table === 'messages' ? [{ direction: 'inbound', body_plain: ticket.body_plain, received_at: '2026-01-01' }] : [];
    const query: Query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  },
};
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
  const result = await consultTicketAssistant({ ...identity, ...(withTicket ? { ticketId } : {}), messages: [{ role: 'user', content }] }, deps);
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
