import { describe, expect, it, mock } from 'bun:test';
// Application modules validate their environment on import; synthetic values keep this suite independent of file order.
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
const { sharedAgentTools, contractTools } = await import('./agent-tools');
const { memoryDb } = await import('../test-support/memory-db');
const { inngestAgentSteps } = await import('./agent-steps');
const { TICKET_ASSISTANT_CONTRACT, ACCOUNT_ASSISTANT_CONTRACT, assistantContract } = await import('@kairo/intelligence');

type Filters = Record<string, unknown>;
function database(rows: Record<string, unknown>) {
  const queries: { table: string; filters: Filters; order?: string; limit?: number }[] = [];
  const db = { from: (table: string) => {
    const query: { table: string; filters: Filters; order?: string; limit?: number } = { table, filters: {} };
    queries.push(query);
    const result = () => ({ data: rows[table] ?? null, error: null });
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => { query.filters[column] = value; return chain; },
      order: (column: string) => { query.order = column; return chain; },
      limit: (value: number) => { query.limit = value; return chain; },
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  } };
  return { db: db as never, queries };
}
const ticket = { id: 'ticket', subject: 'Access', body_plain: 'Please restore access.', conversation_id: 'conversation',
  from_email: 'client@outside.com', to_email: 'support@acme.com', ticket_type: 'support', priority: 'P2', category: 'account',
  status: 'open', model_verdict: null, abstain: false };
const scope = { feature: 'synthetic_block', accountId: 'account', ticketId: 'ticket', userId: 'user' };

describe('shared agent tools', () => {
  it('gives a block only the tools its contract lists, in contract order', () => {
    const registry = sharedAgentTools(scope, { db: database({}).db });
    expect(contractTools(TICKET_ASSISTANT_CONTRACT, registry).map((definition) => definition.name))
      .toEqual(['inspect_ticket', 'find_tickets', 'list_sender_tickets', 'account_stats', 'read_ticket_timeline', 'read_ticket_notes', 'read_client_profile',
        'read_ticket_sla', 'read_ticket_relations', 'read_account_memory', 'search_similar_cases', 'decide_classification', 'draft_reply']);
    expect(() => contractTools({ feature: 'synthetic_block', tools: ['send_email'] }, registry)).toThrow('unknown tool send_email');
  });

  it('finds and counts tickets by fixed filters inside the account, including the sender of the ticket', async () => {
    const db = memoryDb({ tickets: [
      { ...ticket, id: 'ticket', account_id: 'account', status: 'open', created_at: '2026-06-03' },
      { ...ticket, id: 'earlier', account_id: 'account', status: 'resolved', created_at: '2026-06-02' },
      { ...ticket, id: 'waiting', account_id: 'account', status: 'awaiting_customer', created_at: '2026-06-01' },
      { ...ticket, id: 'foreign', account_id: 'other-account', status: 'open', created_at: '2026-06-04' },
      { ...ticket, id: 'stranger', account_id: 'account', from_email: 'other@outside.com', status: 'open', created_at: '2026-06-05' },
    ] });
    const tools = sharedAgentTools(scope, { db: db as never });
    const sender = await tools.list_sender_tickets!.execute({});
    expect(sender).toMatchObject({ status: 'completed', data: { total: 3, open: 2, byStatus: { open: 1, resolved: 1, awaiting_customer: 1 } } });
    const open = await tools.find_tickets!.execute({ status: 'open' });
    expect(open).toMatchObject({ data: { total: 3 } });
    expect((open.data['tickets'] as { id: string }[]).map((row) => row.id)).not.toContain('foreign');
    expect(await tools.find_tickets!.execute({ assignee: 'me' })).toMatchObject({ status: 'completed' });
  });

  it('summarises the account without reading other accounts', async () => {
    const db = memoryDb({ tickets: [
      { account_id: 'account', status: 'open', priority: 'P1', category: 'billing', assigned_to: null, sla_breached: true, created_at: new Date().toISOString() },
      { account_id: 'account', status: 'resolved', priority: 'P2', category: 'billing', assigned_to: null, sla_breached: false, created_at: '2026-01-01T00:00:00Z', resolved_at: new Date().toISOString() },
      { account_id: 'other-account', status: 'open', priority: 'P1', category: 'billing', assigned_to: null, sla_breached: true, created_at: new Date().toISOString() },
    ] });
    const result = await sharedAgentTools({ feature: 'account_assistant', accountId: 'account', userId: 'user' }, { db: db as never }).account_stats!.execute({});
    expect(result).toMatchObject({ status: 'completed', data: { total: 2, open: 1, unassignedOpen: 1, slaBreachedOpen: 1, createdLast7Days: 1, resolvedLast7Days: 1 } });
  });

  it('reads timeline, notes, relations and the client profile only for its own ticket', async () => {
    const AGENT = '11111111-1111-4111-8111-111111111111';
    const db = memoryDb({
      tickets: [{ ...ticket, id: 'ticket', account_id: 'account', assigned_to: AGENT, group_id: null }],
      profiles: [{ id: AGENT, name: 'Ana Agent' }],
      ticket_lifecycle_timeline: [{ account_id: 'account', ticket_id: 'ticket', occurred_at: '2026-01-02', kind: 'state_change', actor_ref: AGENT, detail: 'open → resolved' },
        { account_id: 'account', ticket_id: 'foreign', occurred_at: '2026-01-03', kind: 'note', actor_ref: AGENT, detail: 'secret' }],
      ticket_notes: [{ account_id: 'account', ticket_id: 'ticket', author_id: AGENT, body: 'Check logs', created_at: '2026-01-02' }],
      ticket_tags: [{ ticket_id: 'ticket', tag: 'vip' }], ticket_followers: [], escalations: [], csat_events: [{ ticket_id: 'ticket', score: 5, comment: null, submitted_at: '2026-01-03' }],
      clients: [], draft_contact: [], tenant_sla_rules: [], ticket_priority_sla_config: [],
    });
    const tools = sharedAgentTools(scope, { db: db as never });
    const timeline = await tools.read_ticket_timeline!.execute({});
    expect(timeline.data['events']).toEqual([{ at: '2026-01-02', kind: 'state_change', actorType: undefined, actor: 'Ana Agent', detail: 'open → resolved' }]);
    expect(await tools.read_ticket_notes!.execute({})).toMatchObject({ data: { notes: [{ author: 'Ana Agent', body: 'Check logs' }] } });
    expect(await tools.read_ticket_relations!.execute({})).toMatchObject({ data: { assignee: { name: 'Ana Agent' }, tags: ['vip'], csat: [{ score: 5 }] } });
    expect(await tools.read_client_profile!.execute({})).toMatchObject({ status: 'completed', missing: ['client'] });
    expect(await tools.read_ticket_sla!.execute({})).toMatchObject({ status: 'completed' });
  });

  it('serves the account assistant, without ticket tools, when no ticket is selected', () => {
    const registry = sharedAgentTools({ feature: 'account_assistant', accountId: 'account', userId: 'user' }, { db: database({}).db });
    expect(assistantContract(undefined)).toBe(ACCOUNT_ASSISTANT_CONTRACT);
    expect(assistantContract('ticket')).toBe(TICKET_ASSISTANT_CONTRACT);
    expect(contractTools(ACCOUNT_ASSISTANT_CONTRACT, registry).map((definition) => definition.name))
      .toEqual(['read_account_memory', 'find_tickets', 'account_stats']);
  });

  it('reads the conversation only inside the account and ticket scope', async () => {
    const { db, queries } = database({ tickets: ticket, messages: [{ direction: 'inbound', body_plain: 'Please restore access.', received_at: '2026-01-01T00:00:00Z' }] });
    const result = await sharedAgentTools(scope, { db }).read_conversation!.execute({});
    expect(result).toMatchObject({ status: 'completed', authorization: 'read', data: { ticket: { id: 'ticket' }, messages: [{ direction: 'inbound' }] } });
    expect(queries.map((query) => [query.table, query.filters['account_id']])).toEqual([['tickets', 'account'], ['messages', 'account']]);
  });

  it('fails instead of reading when the scope has no ticket', async () => {
    const result = await sharedAgentTools({ feature: 'synthetic_block', accountId: 'account' }, { db: database({}).db }).read_conversation!.execute({});
    expect(result).toEqual({ status: 'failed', authorization: 'denied', data: {}, missing: ['ticket'], needsReview: true });
  });

  it('reads recorded decisions newest first and bounded', async () => {
    const { db, queries } = database({ ticket_decision_history: [{ contract: 'historical_learning', status: 'pending_human_review', result: { nextAction: 'respond' }, created_at: '2026-01-01T00:00:00Z' }] });
    const result = await sharedAgentTools(scope, { db }).read_case_decisions!.execute({});
    expect(result.data).toEqual({ decisions: [{ contract: 'historical_learning', status: 'pending_human_review', createdAt: '2026-01-01T00:00:00Z', result: '{"nextAction":"respond"}' }] });
    expect(queries[0]).toMatchObject({ table: 'ticket_decision_history', filters: { account_id: 'account', ticket_id: 'ticket' }, order: 'created_at', limit: 10 });
  });

  it('reports missing account memory instead of inventing it', async () => {
    const result = await sharedAgentTools(scope, { db: database({ tickets: ticket }).db,
      tenantSettings: async () => ({ language: 'en', businessContext: undefined }),
      approvedKnowledge: async () => { throw new Error('Synthetic retrieval failure'); },
      approvedLearnings: async () => [{ accountId: 'account', origin: 'human_correction', status: 'approved', learningType: 'policy',
        summary: 'Acme replaces damaged items.', evidence: { ticketIds: ['ticket'], sourceCount: 3 }, confidence: null }],
    }).read_account_memory!.execute({});
    expect(result).toMatchObject({ status: 'completed', missing: ['business_context', 'approved_knowledge'], needsReview: true,
      data: { businessContext: null, approvedKnowledge: [], learnings: [{ type: 'policy', summary: 'Acme replaces damaged items.', sources: 3 }] } });
  });

  it('asks typed judgments under the calling block and rejects malformed questions', async () => {
    const judge = mock(async () => ({ answers: { failure: { type: 'noul', noul: 0.9 } }, model: 'decision-model', llmCallId: null }));
    const tools = sharedAgentTools(scope, { db: database({}).db, judge, logger: async () => null });
    const request = { state: { message: 'The delivery never arrived.' }, questions: [{ id: 'failure', type: 'noul', instructions: 'Does the sender report a failed delivery?' }] };
    expect(await tools.ask_judgments!.execute(request)).toMatchObject({ status: 'completed', data: { answers: { failure: { noul: 0.9 } } } });
    expect((judge.mock.calls[0] as unknown[])[1]).toMatchObject({ feature: 'synthetic_block_judgments', context: { accountId: 'account', ticketId: 'ticket' } });
    await expect(tools.ask_judgments!.execute({ state: {}, questions: [{ id: 'Bad Id', type: 'noul', instructions: 'x' }] })).rejects.toThrow();
  });

  it('proposes knowledge only for review, inside the ticket scope and stage', async () => {
    const propose = mock(async () => ({ status: 'proposed' as const }));
    const result = await sharedAgentTools({ ...scope, stage: 'backfill' }, { db: database({}).db, propose: propose as never })
      .propose_knowledge!.execute({ messageId: '00000000-0000-4000-8000-000000000001' });
    expect(result).toMatchObject({ status: 'proposed', authorization: 'human_review', needsReview: true });
    expect((propose.mock.calls[0] as unknown[])[0]).toEqual({ accountId: 'account', ticketId: 'ticket', messageId: '00000000-0000-4000-8000-000000000001', stage: 'backfill' });
  });
});

describe('synthesis tools', () => {
  it('lists the account tickets of one tier, newest first and bounded', async () => {
    const { db, queries } = database({ tickets: [{ id: 't1', subject: 'Access', body_plain: 'x'.repeat(600), ticket_type: 'support',
      priority: 'P2', category: 'account', status: 'open', classification_tier: 1, created_at: '2026-01-01T00:00:00Z' }] });
    const result = await sharedAgentTools({ feature: 'business_synthesis', accountId: 'account' }, { db }).list_account_tickets!.execute({ tier: 1, limit: 30 });
    expect(result.data).toEqual({ tickets: [{ id: 't1', subject: 'Access', opening: 'x'.repeat(400), type: 'support', priority: 'P2',
      category: 'account', status: 'open', tier: 1 }] });
    expect(queries[0]).toMatchObject({ table: 'tickets', filters: { account_id: 'account', classification_tier: 1 }, order: 'created_at', limit: 30 });
  });

  it('groups tickets by the similarity of their stored embeddings and reports the ones without one', async () => {
    const rows = [
      { id: 'a1', embedding: '[1,0,0]' }, { id: 'a2', embedding: '[0.95,0.05,0]' },
      { id: 'b1', embedding: [0, 1, 0] }, { id: 'c1', embedding: null },
    ];
    const { resolveModelRoute, configuredEmbeddingDimensions } = await import('@kairo/intelligence');
    const route = resolveModelRoute('embedding');
    const dimensions = configuredEmbeddingDimensions();
    const calls: Record<string,unknown>[] = [];
    const db = { rpc: async (name: string,args:Record<string,unknown>) => {
      expect(name).toBe('semantic_sources'); calls.push(args);
      return { data: rows.map(row => {
        const vector = typeof row.embedding === 'string' ? JSON.parse(row.embedding) as number[] : row.embedding;
        return { source: { reference: { kind: 'ticket', id: row.id }, accountId: 'account', revision: 'r1',
          text: 'Invented Acme case', preparation: 'v1', index: vector ? { revision: 'r1', preparation: 'v1',
            space: { provider: route.provider, model: route.model, dimensions },
            vector: [...vector, ...Array<number>(dimensions - vector.length).fill(0)] } : null } };
      }), error: null };
    } } as never;
    const result = await sharedAgentTools({ feature: 'business_synthesis', accountId: 'account' }, { db })
      .group_similar_tickets!.execute({ ticketIds: ['a1', 'a2', 'b1', 'c1'] });
    expect(calls[0]).toMatchObject({p_account_id:'account',p_ids:['a1','a2','b1','c1']});
    expect(result).toMatchObject({ data: { groups: [['a1', 'a2']], alone: ['b1'], withoutEmbedding: ['c1'] }, missing: ['ticket_embeddings'] });
  });


});

describe('Inngest agent steps', () => {
  it('prefixes every model and tool step with the run key', async () => {
    const ids: string[] = [];
    const steps = inngestAgentSteps({ run: async (id, fn) => { ids.push(id); return fn(); } }, 'historical:ticket');
    expect(await steps('historical_learning:model:0', async () => 'answer')).toBe('answer');
    expect(ids).toEqual(['historical:ticket:historical_learning:model:0']);
  });
});
