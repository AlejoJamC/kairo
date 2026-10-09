import { expect, test } from 'bun:test';
import type { TicketAssistantDeps } from './ticket-assistant';
import type { LlmCallRecord } from '@kairo/intelligence';

type Row = Record<string, unknown>;
const identity = { accountId: 'acme-account', ticketId: 'acme-ticket', userId: 'acme-agent' };
const context = { language: 'en' as const, tenantMailbox: 'support@acme.com',
  tenantMailboxes: ['support@acme.com'], businessContext: 'Acme provides customer support software.' };

/** Only storage and retrieval dependencies are isolated; model responses are real. */
function storageFixture() {
  const tables = new Map<string, Row[]>([
    ['tickets', [{ id: identity.ticketId, account_id: identity.accountId, subject: 'Cannot export',
      body_plain: 'The export button does nothing. Please help.', from_email: 'client@outside.com',
      to_email: 'support@acme.com', conversation_id: 'acme-conversation', client_id: null,
      ticket_type: 'support', priority: 'P2', category: 'technical', emotion: 'neutral', status: 'open', abstain: true }]],
    ['messages', [{ id: 'acme-message', account_id: identity.accountId, conversation_id: 'acme-conversation',
      direction: 'inbound', body_plain: 'The export button does nothing. Please help.', received_at: '2026-01-01' }]],
    ['kb_articles', [{ id: 'acme-article', account_id: identity.accountId, is_published: true,
      title: 'Repair export configuration', content: 'Open Settings, enable exports, then retry the export button.', tags: [] }]],
    ['ticket_proposals', []],
  ]);
  let rejectProposal = false;
  let rejectRetrieval = false;
  const db = {
    from(table: string) {
      if (!tables.has(table)) throw new Error('Unexpected integration fixture table');
      let rows = tables.get(table)!;
      let error: { message: string } | null = null;
      let descending = false;
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { rows = rows.filter((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[key])); return query; },
        contains(key: string, values: unknown[]) {
          rows = rows.filter((row) => Array.isArray(row[key]) && values.every((value) => (row[key] as unknown[]).includes(value)));
          return query;
        },
        order(_key: string, options: { ascending: boolean }) { descending = !options.ascending; return query; },
        limit(limit: number) { rows = [...rows]; if (descending) rows.reverse(); rows = rows.slice(0, limit); return query; },
        insert(input: Row) {
          if (table === 'ticket_proposals' && rejectProposal) { rows = []; error = { message: 'Synthetic storage failure' }; }
          else {
            const row = { id: `acme-${table}-${tables.get(table)!.length}`, ...input };
            tables.get(table)!.push(row); rows = [row];
          }
          return query;
        },
        async single() { return { data: rows[0] ?? null, error }; },
        async maybeSingle() { return { data: rows[0] ?? null, error }; },
        then<T>(resolve: (result: { data: Row[]; error: typeof error }) => T | PromiseLike<T>) {
          return Promise.resolve({ data: rows, error }).then(resolve);
        },
      };
      return query;
    },
    async rpc(name: string, args: Row) {
      expect(args['p_account_id']).toBe(identity.accountId);
      if (rejectRetrieval) return { data: null, error: { message: 'Synthetic retrieval failure' } };
      if (name === 'find_relevant_kb') return { data: [{ article_id: 'acme-article', similarity: 0.95 }], error: null };
      if (name === 'find_similar_tickets') return { data: [], error: null };
      throw new Error('Unexpected integration fixture RPC');
    },
  };
  return { db: db as unknown as NonNullable<TicketAssistantDeps['db']>, tables,
    failProposals() { rejectProposal = true; }, failRetrieval() { rejectRetrieval = true; } };
}

test.skipIf(process.env['RUN_GATEWAY_INTEGRATION'] !== '1')(
  'Gateway integration: real decisions, generation, all ticket tools and honest failure results',
  async () => {
    const { consultTicketAssistant } = await import('./ticket-assistant');
    const { suggestReply } = await import('./reply-suggestion');
    const { draftKnowledgeFromTicket } = await import('./knowledge-candidate');
    const { retrieveTicketContext } = await import('./ticket-context');
    const { ProviderError, resolveModelRoute } = await import('@kairo/intelligence');
    const fixture = storageFixture();
    const calls: LlmCallRecord[] = [];
    const logger = async (record: LlmCallRecord) => { calls.push(record); return null; };
    const retrieve: NonNullable<TicketAssistantDeps['retrieveContext']> = (input) => retrieveTicketContext(input, {
      supabase: fixture.db, embed: async () => Array.from({ length: 512 }, (_, index) => index === 0 ? 1 : 0),
    });
    const deps: TicketAssistantDeps = {
      db: fixture.db, resolveContext: async () => context, retrieveContext: retrieve, logger,
      suggest: (input) => suggestReply(input, { supabase: fixture.db, logger,
        resolveLanguage: async () => 'en', retrieve }),
    };
    console.log(JSON.stringify({ integration: 'gateway', models: ['classification', 'reply', 'knowledge_decision', 'knowledge_draft', 'assistant']
      .map((role) => resolveModelRoute(role as Parameters<typeof resolveModelRoute>[0])) }));

    const result = await consultTicketAssistant({ ...identity, messages: [{ role: 'user',
      content: 'Inspect this ticket, request a fresh classification with decide_classification, then draft a reply with draft_reply. Use all three tools and summarize their actual results. Leave every proposal for human review.' }] }, deps);
    expect(result).not.toBeNull();
    expect(result!.text.trim().length).toBeGreaterThan(0);
    for (const [name, status] of [['inspect_ticket', 'completed'], ['decide_classification', 'proposed'], ['draft_reply', 'proposed']]) {
      expect(result!.operations.some((operation) => operation.tool === name && operation.result.status === status)).toBe(true);
    }
    const classification = result!.operations.find((operation) => operation.tool === 'decide_classification')!;
    expect(classification.result.authorization).toBe('human_review');
    expect(classification.result.data['verdict']).toHaveProperty('decision.answers');
    expect(fixture.tables.get('ticket_proposals')).toHaveLength(1);
    expect(fixture.tables.get('ticket_proposals')![0]!['status']).toBe('pending');
    expect(calls.some((call) => call.feature === 'email_classification' && call.errorCode === null)).toBe(true);
    expect(calls.some((call) => call.feature === 'reply_suggestion' && call.errorCode === null)).toBe(true);
    expect(calls.some((call) => call.feature === 'ticket_assistant' && call.errorCode === null)).toBe(true);
    console.log(JSON.stringify({ check: 'all_ticket_tools', passed: true,
      operations: result!.operations.map(({ tool, result }) => ({ tool, status: result.status })), model: result!.model }));

    fixture.tables.get('messages')!.push(
      { account_id: identity.accountId, conversation_id: 'acme-conversation', direction: 'outbound',
        body_plain: 'Open Settings, enable exports, then retry the export button.', received_at: '2026-01-02' },
      { account_id: identity.accountId, conversation_id: 'acme-conversation', direction: 'inbound',
        body_plain: 'Enabling exports fixed the issue. The export button now works. Thank you.', received_at: '2026-01-03' },
    );
    const knowledge = await draftKnowledgeFromTicket(identity, { supabase: fixture.db, logger,
      resolveLanguage: async () => 'en', embed: async () => ({ status: 'ok' }) });
    expect(knowledge.status).toBe('drafted');
    const article = fixture.tables.get('kb_articles')!.find((row) => row['is_published'] === false);
    expect(article).toBeDefined();
    expect(article!['tags']).toContain('scope:account');
    expect(knowledge).toHaveProperty('decision.audit.answers');
    console.log(JSON.stringify({ check: 'knowledge_decision_and_draft', passed: true }));

    fixture.failProposals();
    const failed = await consultTicketAssistant({ ...identity, messages: [{ role: 'user',
      content: 'Inspect this ticket and use draft_reply to prepare a reply proposal. Report whether that tool actually succeeded.' }] }, deps);
    expect(failed).not.toBeNull();
    expect(failed!.operations.some((operation) => operation.tool === 'draft_reply' && operation.result.status === 'failed')).toBe(true);
    expect(fixture.tables.get('ticket_proposals')).toHaveLength(1);
    console.log(JSON.stringify({ check: 'failed_persistence_tool_result', passed: true }));

    const callCount = calls.length;
    fixture.failRetrieval();
    const failure = await suggestReply(identity, { supabase: fixture.db, logger,
      resolveLanguage: async () => 'en', retrieve }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(calls).toHaveLength(callCount);
    expect(fixture.tables.get('ticket_proposals')).toHaveLength(1);
    console.log(JSON.stringify({ check: 'degraded_retrieval_blocks_generation', passed: true }));
  },
  240_000,
);
