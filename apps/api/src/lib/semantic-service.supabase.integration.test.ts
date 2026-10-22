import { beforeAll, afterAll, describe, expect, it, mock } from 'bun:test';
import { SQL } from 'bun';
import { randomUUID } from 'node:crypto';
import { configuredEmbeddingDimensions, resolveModelRoute } from '@kairo/intelligence';
import { createClient } from '@supabase/supabase-js';
import { isolatedSemanticTarget, assertSemanticTestIdentity } from '../test-support/local-supabase.js';
import { createBackendSemanticService } from './semantic-service.js';
import { processDecisionWork, type DecisionWork } from './decision-workflow.js';
import { maybeGenerateTicketEmbedding } from './ticket-embedding.js';
import { findRelevantKb, retrieveTicketContext } from './ticket-context.js';
import { suggestReply, type SuggestReplyDeps } from './reply-suggestion.js';
import { approvedWorkflowKnowledge, enqueueWorkflowKnowledge } from './workflow-knowledge.js';
import { sharedAgentTools } from './agent-tools.js';

const target = isolatedSemanticTarget();
const admin = target ? createClient(target.url, target.serviceRoleKey, { auth: { persistSession: false } }) : null!;
const vector = [1, ...Array<number>(767).fill(0)];
const space = { provider: 'synthetic', model: 'acme', dimensions: 768 };
const embed = mock(async (_text: string) => vector);
const forbiddenInference = mock(async (): Promise<never> => { throw new Error('Indexing must not run inference'); });
let planId: string;
let sql: SQL;
function check(error: { code?: string } | null) {
  if (error) throw new Error(`Synthetic fixture operation failed (${error.code ?? 'unknown'})`);
}
beforeAll(async () => {
  if (!target) return;
  await assertSemanticTestIdentity(target);
  const url = new URL(process.env['SEMANTIC_TEST_DB_URL'] ?? 'http://invalid');
  if (!['postgres:','postgresql:'].includes(url.protocol) || !['127.0.0.1','localhost'].includes(url.hostname) ||
    !url.port || ['54321','54322','55494'].includes(url.port)) throw new Error('SQL tests refuse an existing development endpoint');
  sql = new SQL(url.toString());
  const [proof] = await sql`SELECT public.semantic_test_identity() AS identity`;
  if (proof.identity.projectId !== target.projectId || proof.identity.runToken !== target.runToken) throw new Error('SQL test identity mismatch');
  const { data, error } = await admin.from('plans').upsert({ code: 'acme-semantic-integration', name: 'Acme', seat_limit_default: 5 }, { onConflict: 'code' }).select('id').single();
  check(error); planId = data!.id;
});
afterAll(async () => { if (sql) await sql.close(); });
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

async function actor(f: Fixture) {
  const id = randomUUID();
  await sql`INSERT INTO auth.users(id,email) VALUES(${id},${`${id}@acme.com`})`;
  check((await admin.from('account_members').insert({ account_id: f.account, user_id: id, role: 'agent' })).error);
  return id;
}

function replyDependencies(afterDraft?: () => Promise<void>): SuggestReplyDeps {
  return { supabase: admin,
    retrieve: input => retrieveTicketContext(input, { supabase: admin, embed, space }),
    retrieveApproved: (account, query, ticket, db) => approvedWorkflowKnowledge(account, query, ticket, db, { embed, space }),
    run: async request => {
      await afterDraft?.();
      const sourceId = request.vars['kb_articles']!.match(/### \[([^\]]+)\]/)?.[1];
      return { data: { suggestion: 'Use the invented recovery procedure.', confidence: 0.8, detected_language: 'en', referenced_kb_articles: sourceId ? [sourceId] : [] },
        prompt: 'synthetic', promptVersion: 'synthetic', model: 'synthetic/reply',
        usage: { promptTokens: 0, completionTokens: 0 }, latencyMs: 0, llmCallId: randomUUID() };
    },
    validate: async () => ({ value: { support: { type: 'choice', choice: 'supported', confidence: 1,
      probabilities: { supported: 1, unsupported: 0, uncertain: 0 } } }, model: 'synthetic/validation', callId: null }),
  };
}

async function waitingForLock(functionName: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = await sql`SELECT count(*)::integer AS count FROM pg_stat_activity
      WHERE wait_event_type='Lock' AND query LIKE ${`%${functionName}%`}`;
    if (row.count > 0) return;
    await Bun.sleep(20);
  }
  throw new Error('The concurrent request did not reach its database lock');
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
    await enqueueWorkflowKnowledge(f.account, admin);
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
  it('delegates account processing to the existing knowledge workflow for only its account', async () => {
    const f = await fixture(false), other = await fixture();
    check((await admin.from('kb_articles').insert(Array.from({ length: 201 }, (_, position) => ({
      account_id: f.account, title: `Acme policy ${position}`, content: 'Invented reference policy.', is_published: true,
    })))).error);
    const count = async (account: string) => {
      const result = await admin.from('knowledge_candidate_runs').select('id', { count: 'exact', head: true }).eq('account_id', account);
      check(result.error); return result.count;
    };
    expect(await count(f.account)).toBe(0);
    await enqueueWorkflowKnowledge(f.account, admin);
    expect(await count(f.account)).toBe(201);
    expect(await count(other.account)).toBe(0);
  });

  it('stores a reply from real retrieved references and preserves the exact approved version', async () => {
    const f = await fixture(), user = await actor(f);
    await indexTicket(f); const version = await processKnowledge(f);
    const result = await suggestReply({ accountId: f.account, ticketId: f.ticket, userId: user }, replyDependencies());
    expect(result?.proposalId).toBeTruthy();
    expect(result?.referencedKbArticles).toEqual([f.article]);
    const history = await admin.from('ticket_decision_history').select('result').eq('account_id', f.account).eq('contract','reply_suggestion').single();
    check(history.error);
    expect(history.data!.result).toMatchObject({ sources: [{ id: f.article, version, kind: 'article' }], authorization: 'human_review' });
  });

  it('refuses a generated reply when its case revision changes before persistence', async () => {
    const f = await fixture(), user = await actor(f);
    await indexTicket(f); await processKnowledge(f);
    await expect(suggestReply({ accountId: f.account, ticketId: f.ticket, userId: user }, replyDependencies(async () => {
      check((await admin.from('tickets').update({ body_plain: 'New invented case evidence.' }).eq('id',f.ticket)).error);
    }))).rejects.toThrow('Reply proposal persistence failed');
    const proposals = await admin.from('ticket_proposals').select('id').eq('ticket_id',f.ticket);
    check(proposals.error); expect(proposals.data).toHaveLength(0);
  });

  it('rechecks cited knowledge after waiting for a concurrent withdrawal to commit', async () => {
    const f = await fixture(), user = await actor(f);
    await indexTicket(f); await processKnowledge(f);
    const transaction = await sql.reserve();
    let pending: Promise<{ error?: unknown }> | undefined;
    try {
      await transaction`BEGIN`;
      await transaction`SELECT id FROM kb_articles WHERE id=${f.article} FOR UPDATE`;
      pending = suggestReply({ accountId: f.account, ticketId: f.ticket, userId: user }, replyDependencies())
        .then(() => ({}), error => ({ error }));
      await waitingForLock('save_reply_decision');
      await transaction`UPDATE kb_articles SET is_published=false WHERE id=${f.article}`;
      await transaction`COMMIT`;
      expect((await pending).error).toMatchObject({ message: 'Reply proposal persistence failed' });
      const proposals = await admin.from('ticket_proposals').select('id').eq('ticket_id',f.ticket);
      check(proposals.error); expect(proposals.data).toHaveLength(0);
    } finally { await transaction`ROLLBACK`; transaction.release(); await pending; }
  });

  it('rejects a late index after waiting for a concurrent source edit to commit', async () => {
    const f = await fixture(false), transaction = await sql.reserve();
    let pending: ReturnType<typeof indexTicket> | undefined;
    try {
      await transaction`BEGIN`;
      await transaction`UPDATE tickets SET body_plain='Concurrent invented revision' WHERE id=${f.ticket}`;
      pending = indexTicket(f);
      await waitingForLock('store_semantic_index');
      await transaction`COMMIT`;
      expect(await pending).toEqual({ status: 'failed', reason: 'revision_changed' });
      expect(await indexTicket(f)).toEqual({ status: 'ok' });
    } finally { await transaction`ROLLBACK`; transaction.release(); await pending; }
  });
});

// Both opt-ins are required: this exercises real model calls and writes synthetic database fixtures.
describe.skipIf(!target || process.env['RUN_OLLAMA_EMBEDDING_TESTS'] !== '1')('configured Ollama through the Supabase adapter', () => {
  it('indexes through the publication worker and retrieves through the public service without embedding overrides', async () => {
    const route = resolveModelRoute('embedding');
    expect(route.provider).toBe('ollama');
    const endpoint = new URL(process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434');
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(endpoint.hostname);
    expect(endpoint.protocol).toBe('http:');
    expect(endpoint.port).toBe('11434');
    expect(configuredEmbeddingDimensions()).toBe(768);
    const originalFetch = globalThis.fetch;
    let modelCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== endpoint.origin && url.origin !== new URL(target!.url).origin) {
        throw new Error('This test only permits the local Ollama and Supabase endpoints');
      }
      if (url.origin === endpoint.origin && url.pathname === '/api/embeddings') modelCalls++;
      return originalFetch(input, { ...init, redirect: 'error' });
    }) as typeof fetch;
    try {
      const f = await fixture();
      expect(await maybeGenerateTicketEmbedding({ supabase: admin, accountId: f.account, ticketId: f.ticket,
        subject: 'Caller copy', bodyPreview: 'Caller copy' })).toEqual({ status: 'ok' });
      const version = await currentVersion(f.article);
      const work = await admin.from('decision_work_items').select('*').eq('account_id', f.account)
        .eq('knowledge_version_id', version).eq('contract', 'knowledge_change').single();
      check(work.error);
      await processDecisionWork(work.data as DecisionWork, admin, {
        decide: forbiddenInference, analyze: forbiddenInference, propose: forbiddenInference,
      });
      const service = createBackendSemanticService({ db: admin, profile: { threshold: 0 },
        scope: { accountId: f.account, actor: { kind: 'workflow', id: 'local-integration' }, permissions: ['index', 'retrieve'] } });
      const callsAfterIndexing = modelCalls;
      expect(callsAfterIndexing).toBeGreaterThanOrEqual(2);
      expect((await service.indexSource({ source: { kind: 'knowledge_version', id: version } })).status).toBe('unchanged');
      expect(modelCalls).toBe(callsAfterIndexing);
      const found = await service.retrieve({ purpose: 'approved_knowledge', sources: ['knowledge_version'],
        query: { text: 'Acme access recovery\nUse the invented recovery procedure.' } });
      expect(modelCalls).toBeGreaterThan(callsAfterIndexing);
      expect(found.status).toBe('ok');
      expect(found.matches.map(match => match.version)).toEqual([version]);
      const indices = await admin.from('semantic_indexes').select('provider,model,dimensions').eq('account_id', f.account);
      check(indices.error);
      expect(indices.data).toHaveLength(2);
      expect(indices.data!.every(row => row.provider === route.provider && row.model === route.model && row.dimensions === 768)).toBe(true);
      expect(forbiddenInference).not.toHaveBeenCalled();
    } finally { globalThis.fetch = originalFetch; }
  }, 180000);
});
