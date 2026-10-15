import { describe, expect, it, mock } from 'bun:test';
import type { EmailKnowledgeDeps } from './email-knowledge';

process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'test-service-role-key';
const { proposeEmailKnowledge } = await import('./email-knowledge');
const { withApprovedKnowledge } = await import('./classifier-input');

const input = { accountId: 'account-1', ticketId: 'ticket-1', messageId: 'message-1' };
const source = 'Acme accepts returns within 14 days.';
const proposal = { kind: 'article' as const, title: 'Returns period', content: 'Proposed policy: returns within 14 days.', evidence: [source] };
function answer(value: string) {
  const options = value === 'new' || value === 'redundant' ? ['new','redundant','unknown'] : ['yes', 'no'].includes(value) ? ['yes', 'no']
    : ['supported', 'unsupported', 'uncertain'].includes(value) ? ['supported', 'unsupported', 'uncertain']
    : ['consistent', 'conflict', 'unknown'];
  return { type: 'choice' as const, choice: value, confidence: 1, probabilities: Object.fromEntries(options.map(option => [option, option === value ? 1 : 0])) };
}
function setup(options: { existing?: boolean; linked?: boolean; direction?: string; insertFails?: boolean } = {}) {
  const inserted: unknown[] = [];
  const db = { rpc: async (name: string, args: { p_articles: unknown[]; p_learnings: unknown[] }) => {
    if (name !== 'save_email_knowledge') return { data: [], error: null };
    if (options.insertFails) return { data: null, error: { message: 'Synthetic persistence failure' } };
    inserted.push(...args.p_articles, ...args.p_learnings);
    return { data: args.p_articles.map((_, index) => `article-${index}`), error: null };
  }, from(table: string) {
    let result: unknown = { data: null, error: null };
    const chain = {
      select: () => chain, order: () => { result = { data: [{ id: input.messageId, body_plain: source, direction: 'inbound' }], error: null }; return chain; }, like: () => chain, eq: () => chain, contains: () => chain, limit: () => chain,
      maybeSingle: async () => result,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      insert: (rows: unknown[]) => {
        inserted.push(...rows);
        result = options.insertFails ? { error: { message: 'Synthetic persistence failure' }, data: null }
          : { data: rows.map((row, index) => ({ id: `article-${index}`, tags: (row as { tags: string[] }).tags })), error: null };
        return chain;
      },
    };
    if (table === 'tickets') result = { data: { id: input.ticketId, conversation_id: 'conversation-1' }, error: null };
    if (table === 'ticket_messages') result = { data: options.linked === false ? null : { message_id: input.messageId }, error: null };
    if (table === 'messages') result = { data: { id: input.messageId, body_plain: source, direction: options.direction ?? 'inbound' }, error: null };
    if (table === 'operational_learning') result = { data: [], error: null };
    if (table === 'kb_articles') result = { data: options.existing ? [{ id: 'existing-1' }] : [], error: null };
    return chain;
  } };
  const candidate = mock(async (_state: unknown) => ({ value: { candidate: answer('yes') }, model: 'decision-model', callId: 'call-candidate' }));
  const extract = mock(async () => ({ value: { proposals: [proposal] }, model: 'text-model', callId: 'call-extraction' }));
  const validate = mock(async (state: unknown) => ({ value: (state as { proposals: unknown[] }).proposals.map(() => ({ novelty: answer('new'), support: answer('supported'), policy: answer('consistent') })), model: 'validation-model', callId: 'call-validation' }));
  const deps: EmailKnowledgeDeps = { db: db as unknown as EmailKnowledgeDeps['db'],
    retrieveApproved: async () => [],
    retrieve: async () => ({ kbArticles: [], resolvedCases: [], degraded: [] }),
    context: async () => ({ language: 'en', businessContext: 'Acme accepts returns within 14 days.' }), candidate, extract, validate };
  return { deps, inserted, candidate, extract, validate };
}

describe('incoming email knowledge workflow', () => {
  it('feeds published knowledge back into classification without hiding incomplete evidence', async () => {
    const message = { subject: 'Return request', from: 'client@outside.com', body: source,
      businessContext: 'Acme provides account support.', evidence: { bodySource: 'full' as const, truncated: false, missing: ['tenant_mailbox'] } };
    const result = await withApprovedKnowledge(message, input.accountId, async request => {
      expect(request.accountId).toBe(input.accountId);
      return { articles: [{ id: 'published-1', title: 'Returns', content: source, tags: [], similarity: 0.9 }], degraded: [] };
    }, async () => []);
    expect(JSON.parse(result.businessContext!)).toMatchObject({ configuredBusinessContext: message.businessContext,
      publishedKnowledge: [{ id: 'published-1', content: source }] });
    expect(result.evidence?.missing).toEqual(['tenant_mailbox']);
    const degraded = await withApprovedKnowledge(message, input.accountId, async () => ({ articles: [], degraded: ['embedding_unavailable'] }), async () => []);
    expect(degraded.businessContext).toBe(message.businessContext);
    expect(degraded.evidence?.missing).toContain('approved_knowledge');
  });
  it('chains candidate selection, extraction, validation and unpublished persistence with provenance', async () => {
    const { deps, inserted, candidate, extract, validate } = setup();
    const result = await proposeEmailKnowledge(input, deps);
    expect(result.status).toBe('proposed');
    expect(result).toMatchObject({ proposals: [{ articleId: 'article-0', proposal }] });
    expect(candidate.mock.calls[0]?.[0]).toMatchObject({ businessContext: source, source: { text: source, author: 'unverified_sender' } });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0]?.[0]).toMatchObject({ businessContext: source, proposals: [proposal] });
    expect(inserted[0]).toMatchObject({ account_id: input.accountId, is_published: false, title: proposal.title });
    expect((inserted[0] as { tags: string[] }).tags).toContain('review:human_validation_required');
    expect((inserted[0] as { tags: string[] }).tags).toContain('llm-call:call-validation');
    expect((inserted[0] as { tags: string[] }).tags).not.toContain(`ticket:${input.ticketId}`);
  });
  it('does not generate text for a non-candidate', async () => {
    const { deps, extract, inserted } = setup();
    deps.candidate = async () => ({ value: { candidate: answer('no') }, model: 'decision-model', callId: null });
    expect(await proposeEmailKnowledge(input, deps)).toMatchObject({ status: 'skipped', reason: 'not_candidate' });
    expect(extract).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });
  it('rejects invented quotations before semantic validation or persistence', async () => {
    const { deps, validate, inserted } = setup();
    deps.extract = async () => ({ value: { proposals: [{ ...proposal, evidence: ['Returns within 90 days.'] }] }, model: 'text-model', callId: null });
    expect(await proposeEmailKnowledge(input, deps)).toMatchObject({ proposals: [{ status: 'blocked', reasons: ['invalid_source_quote'] }] });
    expect(validate).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });
  it('preserves conflicts and unsupported claims as unpublished proposals requiring correction', async () => {
    const { deps, inserted } = setup();
    deps.validate = async () => ({ value: [{ novelty: answer('new'), support: answer('unsupported'), policy: answer('conflict') }], model: 'validation-model', callId: null });
    await proposeEmailKnowledge(input, deps);
    expect(inserted[0]).toMatchObject({ is_published: false });
    expect((inserted[0] as { tags: string[] }).tags).toContain('review:business_context_conflict');
    expect((inserted[0] as { tags: string[] }).tags).toContain('review:unsupported_claim');
  });
  it('skips existing proposals and sources outside the ticket without inference', async () => {
    for (const options of [{ existing: true }, { linked: false }, { direction: 'outbound' }]) {
      const { deps, candidate } = setup(options);
      await proposeEmailKnowledge(input, deps);
      expect(candidate).not.toHaveBeenCalled();
    }
  });
  it('does not write partial proposals if validation fails', async () => {
    const { deps, inserted } = setup();
    deps.extract = async () => ({ value: { proposals: [proposal, proposal] }, model: 'text-model', callId: null });
    deps.validate = async () => { throw new Error('Synthetic validation failure'); };
    await expect(proposeEmailKnowledge(input, deps)).rejects.toThrow('Synthetic validation failure');
    expect(inserted).toEqual([]);
  });
  it('keeps unknown business context distinct from a consistent policy', async () => {
    const { deps, inserted } = setup();
    deps.context = async () => ({ language: 'en', businessContext: undefined });
    deps.validate = async () => ({ value: [{ novelty: answer('new'), support: answer('supported'), policy: answer('unknown') }], model: 'validation-model', callId: null });
    await proposeEmailKnowledge(input, deps);
    expect((inserted[0] as { tags: string[] }).tags).toContain('review:business_context_missing');
    expect(inserted[0]).toMatchObject({ is_published: false });
  });
  it('propagates persistence failure instead of claiming completed proposals', async () => {
    const { deps } = setup({ insertFails: true });
    await expect(proposeEmailKnowledge(input, deps)).rejects.toThrow('Knowledge proposal persistence failed');
  });
  it('validates several proposals in one request and persists them together', async () => {
    const { deps, validate, inserted } = setup();
    deps.extract = async () => ({ value: { proposals: [proposal, { ...proposal, kind: 'business_fact' }] }, model: 'text-model', callId: null });
    await proposeEmailKnowledge(input, deps);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(2);
    expect(inserted[1]).toMatchObject({ learning_type: 'business_fact', origin: 'system_derived', status: 'pending_review', evidence: { kind: 'business_fact', sourceMessageId: input.messageId } });
  });
  it('does not duplicate knowledge already captured in approved sources', async () => {
    const { deps, inserted } = setup();
    deps.validate = async () => ({value:[{novelty:answer('redundant'),support:answer('supported'),policy:answer('consistent')}],model:'validation-model',callId:null});
    expect(await proposeEmailKnowledge(input,deps)).toMatchObject({status:'skipped',reason:'no_contribution',proposals:[{reasons:['already_known']}]});
    expect(inserted).toEqual([]);
  });

});
