import { beforeAll, describe, expect, it, mock } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseTarget } from '../test-support/local-supabase.js';
import { createBackendSemanticService } from './semantic-service.js';
import { processDecisionWork, type DecisionWork } from './decision-workflow.js';
import { maybeGenerateTicketEmbedding } from './ticket-embedding.js';
import { findRelevantKb } from './ticket-context.js';
import { approvedWorkflowKnowledge, enqueuePendingSemanticKnowledge } from './workflow-knowledge.js';
import { sharedAgentTools } from './agent-tools.js';

const target = localSupabaseTarget();
const admin = target ? createClient(target.url, target.serviceRoleKey, { auth: { persistSession: false } }) : null!;
const vector = [1, ...Array<number>(767).fill(0)];
const space = { provider: 'synthetic', model: 'acme', dimensions: 768 };
const embed = mock(async (_text: string) => vector);
const forbiddenInference = mock(async (): Promise<never> => { throw new Error('Indexing must not run inference'); });
let planId: string;
function check(error: { code?: string } | null) {
  if (error) throw new Error(`Synthetic fixture operation failed (${error.code ?? 'unknown'})`);
}
beforeAll(async () => {
  if (!target) return;
  const { data, error } = await admin.from('plans').upsert({ code: 'acme-semantic-integration', name: 'Acme', seat_limit_default: 5 }, { onConflict: 'code' }).select('id').single();
  check(error); planId = data!.id;
});
async function fixture(published = true) {
  const account = randomUUID(), ticket = randomUUID(), article = randomUUID();
  check((await admin.from('accounts').insert({ id: account, name: 'Acme', slug: account, plan_id: planId })).error);
  check((await admin.from('tickets').insert({ id: ticket, account_id: account, subject: 'Acme access', body_plain: 'Invented recovery case', status: 'resolved' })).error);
  check((await admin.from('kb_articles').insert({ id: article, account_id: account, title: 'Acme access recovery', content: 'Use the invented recovery procedure.', is_published: published })).error);
  const service = createBackendSemanticService({ db: admin, embed, space,
    scope: { accountId: account, actor: { kind: 'workflow', id: 'synthetic' }, permissions: ['retrieve'], ticketId: ticket } });
  return { account, ticket, article, service };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function indexTicket(f: Fixture, generate: (text: string) => Promise<number[]> = embed) {
  return maybeGenerateTicketEmbedding({ supabase: admin, accountId: f.account, ticketId: f.ticket,
    subject: 'Caller copy', bodyPreview: 'Caller copy', embedFn: generate, space });
}
async function currentVersion(article: string) {
  const { data, error } = await admin.from('latest_knowledge').select('id').eq('source_id', article).single();
  check(error); return data!.id as string;
}
async function processKnowledge(f: Fixture) {
  const version = await currentVersion(f.article);
  // Consume the work actually written by the existing knowledge publication workflow.
  const { data, error } = await admin.from('decision_work_items').select('*').eq('account_id', f.account)
    .eq('knowledge_version_id', version).eq('contract', 'knowledge_change').single();
  check(error);
  await processDecisionWork(data as DecisionWork, admin, { embed, space,
    decide: forbiddenInference, analyze: forbiddenInference, propose: forbiddenInference });
  return version;
}

describe.skipIf(!target)('semantic application consumers through Supabase REST', () => {
  it('does not manufacture semantic jobs or indices from inserting business sources', async () => {
    const f = await fixture();
    const jobs = await admin.from('decision_work_items').select('id').eq('account_id', f.account).eq('contract', 'semantic_index');
    check(jobs.error); expect(jobs.data).toHaveLength(0);
    const indices = await admin.from('semantic_indexes').select('source_id').eq('account_id', f.account);
    check(indices.error); expect(indices.data).toHaveLength(0);
    expect(await indexTicket(f)).toEqual({ status: 'ok' });
    const stored = await admin.from('semantic_indexes').select('source_kind,provider,model,dimensions').eq('account_id', f.account);
    check(stored.error); expect(stored.data).toEqual([{ source_kind: 'ticket', ...space }]);
  });
  it('shares consumer-indexed versions between ticket context and the agent memory tool', async () => {
    const f = await fixture(); const version = await processKnowledge(f);
    const context = await findRelevantKb({ accountId: f.account, ticketId: f.ticket, queryText: 'Acme access' }, { supabase: admin, embed, space });
    expect(context.degraded).toEqual([]);
    expect(context.articles[0]).toMatchObject({ id: f.article, evidence: { version, authority: 'approved_knowledge' } });
    const result = await sharedAgentTools({ feature: 'synthetic', accountId: f.account }, {
      db: admin, tenantSettings: async () => ({ language: 'en', businessContext: 'Acme support.' }), approvedLearnings: async () => [],
      approvedKnowledge: (account, query, ticket, storage) => approvedWorkflowKnowledge(account, query, ticket, storage, { embed, space }),
    }).read_account_memory!.execute({ query: 'Acme access' });
    expect(result).toMatchObject({ status: 'completed', missing: [], data: { approvedKnowledge: [{ id: f.article, version }] } });
    await enqueuePendingSemanticKnowledge(f.account, admin);
    const runs = await admin.from('knowledge_candidate_runs').select('id').eq('account_id', f.account);
    check(runs.error); expect(runs.data!.length).toBeGreaterThanOrEqual(2);
    expect(forbiddenInference).not.toHaveBeenCalled();
  });
  it('lets the publication consumer index approvals and edits while retrieval excludes withdrawn versions', async () => {
    const f = await fixture(false);
    expect((await f.service.retrieve({ purpose: 'approved_knowledge', query: { text: 'Acme' } })).matches).toHaveLength(0);
    check((await admin.from('kb_articles').update({ is_published: true }).eq('id', f.article)).error);
    const first = await processKnowledge(f);
    expect((await f.service.retrieve({ purpose: 'approved_knowledge', query: { text: 'Acme' } })).matches[0]?.version).toBe(first);
    check((await admin.from('kb_articles').update({ content: 'Use the revised invented recovery procedure.' }).eq('id', f.article)).error);
    const awaitingIndex = await f.service.retrieve({ purpose: 'approved_knowledge', query: { text: 'Acme' } });
    expect(awaitingIndex.status).toBe('partial');
    expect(awaitingIndex.matches).toHaveLength(0);
    expect(awaitingIndex.sources).toContainEqual(expect.objectContaining({ source: 'knowledge_version', status: 'unavailable', reason: 'index_missing' }));
    const latest = await processKnowledge(f); expect(latest).not.toBe(first);
    expect((await f.service.retrieve({ purpose: 'approved_knowledge', query: { text: 'Acme' } })).matches.map(match => match.version)).toEqual([latest]);
    check((await admin.from('kb_articles').update({ is_published: false }).eq('id', f.article)).error);
    expect((await f.service.retrieve({ purpose: 'approved_knowledge', query: { text: 'Acme' } })).matches).toHaveLength(0);
  });
  it('isolates accounts even when their content and vectors are identical', async () => {
    const f = await fixture(), other = await fixture(); await processKnowledge(f); await processKnowledge(other);
    const found = await f.service.retrieve({ purpose: 'approved_knowledge', query: { text: 'Acme' } });
    expect(found.status).toBe('ok'); expect(found.matches.map(match => match.version)).toEqual([await currentVersion(f.article)]);
    const foreign = await admin.rpc('semantic_source', { p_account_id: f.account, p_kind: 'ticket', p_id: other.ticket });
    check(foreign.error); expect(foreign.data).toBeNull();
  });
  it('rejects a late vector after an edit and lets the caller retry without generating queue work', async () => {
    const f = await fixture(false);
    expect(await indexTicket(f, async () => {
      check((await admin.from('tickets').update({ body_plain: 'Concurrent invented revision' }).eq('id', f.ticket)).error);
      return vector;
    })).toEqual({ status: 'failed', reason: 'revision_changed' });
    expect(await indexTicket(f)).toEqual({ status: 'ok' });
    embed.mockClear(); expect(await indexTicket(f)).toEqual({ status: 'ok' }); expect(embed).not.toHaveBeenCalled();
    const jobs = await admin.from('decision_work_items').select('id').eq('account_id', f.account).eq('contract', 'semantic_index');
    check(jobs.error); expect(jobs.data).toHaveLength(0);
  });
  it('exposes a provider failure without pretending an index was stored', async () => {
    const f = await fixture(false);
    expect(await indexTicket(f, async () => { throw new Error('Synthetic provider outage'); })).toEqual({ status: 'failed', reason: 'provider_unavailable' });
    const stored = await admin.from('semantic_indexes').select('source_id').eq('account_id', f.account);
    check(stored.error); expect(stored.data).toHaveLength(0);
    expect(await indexTicket(f)).toEqual({ status: 'ok' });
  });
  it('lets the pipeline explicitly process every approved source across REST pages for only its account', async () => {
    const f = await fixture(false), other = await fixture();
    check((await admin.from('kb_articles').insert(Array.from({ length: 201 }, (_, position) => ({
      account_id: f.account, title: `Acme policy ${position}`, content: 'Invented reference policy.', is_published: true,
    })))).error);
    const count = async (account: string) => {
      const result = await admin.from('knowledge_candidate_runs').select('id', { count: 'exact', head: true }).eq('account_id', account);
      check(result.error); return result.count;
    };
    expect(await count(f.account)).toBe(0);
    await enqueuePendingSemanticKnowledge(f.account, admin);
    expect(await count(f.account)).toBe(201);
    expect(await count(other.account)).toBe(0);
  });
});
