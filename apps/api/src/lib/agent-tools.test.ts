import { describe, expect, it, mock } from 'bun:test';
// Application modules validate their environment on import; synthetic values keep this suite independent of file order.
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
const { sharedAgentTools, contractTools, groupBySimilarity } = await import('./agent-tools');
const { inngestAgentSteps } = await import('./agent-steps');
const { TICKET_ASSISTANT_CONTRACT } = await import('@kairo/intelligence');

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
      .toEqual(['inspect_ticket', 'decide_classification', 'draft_reply']);
    expect(() => contractTools({ feature: 'synthetic_block', tools: ['send_email'] }, registry)).toThrow('unknown tool send_email');
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
    const db = { from: () => {
      const chain = { select: () => chain, eq: () => chain, in: () => chain,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve) };
      return chain;
    } } as never;
    const result = await sharedAgentTools({ feature: 'business_synthesis', accountId: 'account' }, { db })
      .group_similar_tickets!.execute({ ticketIds: ['a1', 'a2', 'b1', 'c1'] });
    expect(result).toMatchObject({ data: { groups: [['a1', 'a2']], alone: ['b1'], withoutEmbedding: ['c1'] }, missing: ['ticket_embeddings'] });
  });

  it('does not let one bridging ticket chain two unrelated groups', () => {
    const groups = groupBySimilarity(new Map([
      ['a', [1, 0]], ['b', [0.8, 0.6]], ['c', [0.6, 0.8]], ['d', [0, 1]],
    ]), 0.9);
    expect(groups).toEqual([['a'], ['b', 'c'], ['d']]);
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
