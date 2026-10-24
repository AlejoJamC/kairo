import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { localSupabaseTarget, createSemanticTestClient } from '../apps/api/src/test-support/local-supabase';

// The scheduler, mailbox and judgment responses are transport fixtures.
// Product handlers, database effects and semantic retrieval are not replaced.
const target = localSupabaseTarget();
const enabled = !!target && process.env['RUN_SEMANTIC_FLOW_EVAL'] === '1';
const realVectors = process.env['RUN_OLLAMA_EMBEDDING_TESTS'] === '1';
const withObservability = process.env['RUN_SEMANTIC_OBSERVABILITY'] === '1';
let telemetry: Awaited<ReturnType<typeof import('./semantic-observability')['startSemanticObservability']>> | undefined;
const originalFetch = globalThis.fetch;
const db = target ? createSemanticTestClient(target) : null!;
type Event = { name: string; data: Record<string, unknown> };
type Context = { event: Event; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T>; sendEvent: (name: string, event: Event) => Promise<void> } };
const handlers = new Map<string, (context: Context) => Promise<unknown>>();
const events: Event[] = [], steps: string[] = [];
const calls = { classification: 0, evidence: 0, knowledge: 0, decisions: 0, embedding: 0, assistant: 0, reply: 0 };
const title = 'Acme access recovery', text = 'Open Settings and select Recover access.';
let article = '', mail = '', assistantCall = 0;
let fixtureAccount: string | undefined;
function check(error: { code?: string } | null) { if (error) throw new Error(`Semantic evaluation operation failed (${error.code ?? 'unknown'})`); }
function judgment(choice: string, criteria: Record<string, unknown>) {
  expect(Object.keys(criteria)).toContain(choice);
  return { type: 'choice', choice, confidence: 1,
    probabilities: Object.fromEntries(Object.keys(criteria).map(key => [key, Number(key === choice)])) };
}
function language(body: Record<string, unknown>) {
  const properties = (body['format'] as { properties: Record<string, unknown> }).properties;
  if ('actionability' in properties) {
    calls.classification++;
    return { actionability: 'needs_action', subject_matter: 'service', category: 'account', priority: 'P2', tone: 'neutral', urgency: 'medium',
      confidence: 0.9, reasoning: 'The message requests access assistance.', workflow: { request: 'intervention', priority_evidence: 'unknown', urgency_evidence: 'unknown' } };
  }
  if ('observations' in properties) { calls.evidence++; return { observations: [], missing: [], waitingOn: null, resumeWhen: null }; }
  if ('proposals' in properties) {
    calls.knowledge++; expect(body['prompt']).toContain(text);
    return { proposals: [{ kind: 'article', title, content: text, evidence: [text] }] };
  }
  if ('suggestion' in properties) {
    calls.reply++; expect(body['prompt']).toContain(article); expect(body['prompt']).toContain(text);
    return { suggestion: text, confidence: 0.9, detected_language: 'en', referenced_kb_articles: [article] };
  }
  throw new Error('Unexpected simulated language contract');
}
async function transport(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === new URL(target!.url).origin) return originalFetch(input, { ...init, redirect: 'error' });
  if (withObservability && url.origin === 'http://127.0.0.1:4318' && url.pathname === '/v1/traces') {
    return originalFetch(input, { ...init, redirect: 'error' });
  }
  if (url.hostname === 'gmail.googleapis.com') {
    expect(init?.method ?? 'GET').toBe('GET');
    if (url.pathname.endsWith('/profile')) return Response.json({ emailAddress: 'support@acme.com' });
    if (url.pathname.endsWith('/messages')) return Response.json({ messages: [{ id: mail, threadId: mail }] });
    if (url.pathname.endsWith(`/messages/${mail}`)) return Response.json({ id: mail, threadId: mail, snippet: text,
      labelIds: ['INBOX'], payload: { mimeType: 'text/plain', body: { data: Buffer.from(text).toString('base64url') }, headers: [
        { name: 'From', value: 'client@outside.com' }, { name: 'To', value: 'support@acme.com' }, { name: 'Subject', value: title },
        { name: 'Date', value: 'Mon, 01 Jan 2024 12:00:00 GMT' }, { name: 'Message-ID', value: `<${mail}@outside.com>` },
      ] } });
    throw new Error('Unexpected mailbox fixture request');
  }
  const raw = input instanceof Request && init?.body === undefined ? await input.clone().text() : String(init?.body ?? '{}');
  const body = JSON.parse(raw) as Record<string, unknown>;
  if (url.origin === 'http://127.0.0.1:11434') {
    if (url.pathname === '/api/generate') return Response.json({ response: JSON.stringify(language(body)), model: 'acme/simulated-language', prompt_eval_count: 1, eval_count: 1 });
    if (url.pathname === '/api/embeddings') {
      calls.embedding++;
      return realVectors ? originalFetch(input, { ...init, redirect: 'error' }) : Response.json({ embedding: [1, ...Array<number>(767).fill(0)] });
    }
    throw new Error('Unexpected local inference endpoint');
  }
  if (url.origin === 'https://ai-gateway.vercel.sh') {
    // Intercepted before any network operation; no Gateway request is sent.
    if (url.pathname.endsWith('/config')) return Response.json({ models: [
      { id: 'typesafe-ai/jev', modelType: 'evaluation' }, { id: 'acme/flow-assistant', modelType: 'language' },
    ].map(model => ({ ...model, name: 'Acme simulated model', specification: { specificationVersion: 'v4', provider: 'gateway', modelId: model.id } })) });
    if (url.pathname.endsWith('/systemone')) {
      calls.decisions++;
      const values: Record<string, string> = { request: 'intervention', priority_evidence: 'unknown', urgency_evidence: 'unknown', alternative: 'unknown',
        outcome: 'unresolved', learning: 'candidate', candidate: 'yes', contribution: 'none', support: 'supported', novelty: 'new', policy: 'consistent' };
      const answers = Object.fromEntries(Object.entries(body['questions'] as Record<string, { criteria: Record<string, unknown> }>).map(([key, question]) => {
        const value = values[key.replace(/^proposal_\d+_/, '')];
        if (!value) throw new Error('Unexpected simulated decision contract');
        return [key, judgment(value, question.criteria)];
      }));
      return Response.json({ model: 'typesafe-ai/jev', answers, usage: { input_tokens: 1, output_tokens: 1 } });
    }
    if (url.pathname.endsWith('/language-model')) {
      calls.assistant++;
      const tool = ['inspect_ticket', 'draft_reply'][assistantCall++];
      return Response.json({ content: tool ? [{ type: 'tool-call', toolCallId: randomUUID(), toolName: tool, input: '{}' }]
        : [{ type: 'text', text: 'The reply is pending human review.' }],
      finishReason: { unified: tool ? 'tool-calls' : 'stop', raw: tool ? 'tool-calls' : 'stop' }, warnings: [],
      usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
    }
  }
  throw new Error('Semantic evaluation rejected an external network destination');
}
if (enabled) {
  globalThis.fetch = Object.assign(transport, originalFetch);
  mock.module('../apps/api/src/lib/inngest.js', () => ({ inngest: {
    createFunction: (options: { id: string }, handler: (context: Context) => Promise<unknown>) => { handlers.set(options.id, handler); return { options }; },
    send: async (event: Event | Event[]) => { const batch = Array.isArray(event) ? event : [event]; events.push(...batch); return { ids: batch.map(() => randomUUID()) }; },
  } }));
  // Keep transport diagnostics in this evaluation, not a global pipeline log.
  mock.module('../apps/api/src/lib/pipeline-logger.js', () => ({ pipelineLog: () => {}, pipelineLogRun: () => {} }));
}
beforeAll(async () => {
  if (!enabled) return;
  const pending = await db.from('decision_work_items').select('id', { count: 'exact', head: true }).in('status', ['pending', 'running']);
  check(pending.error);
  if (pending.count) throw new Error('Existing local work is pending; refusing to let the evaluation worker claim unrelated jobs');
  if (withObservability) telemetry = await (await import('./semantic-observability')).startSemanticObservability();
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await telemetry?.stop();
  if (fixtureAccount) check((await db.from('decision_work_items').delete().eq('account_id', fixtureAccount)).error);
});
async function execute(id: string, data: Record<string, unknown> = {}) {
  const handler = handlers.get(id);
  if (!handler) throw new Error('Production function was not registered');
  return handler({ event: { name: id, data }, step: {
    run: async (name, fn) => { steps.push(`${id}:${name}`); return fn(); },
    sendEvent: async (_name, event) => { events.push(event); },
  } });
}
async function drain() {
  for (let i = 0; i < 10; i++) {
    const result = await execute('decision-workflows') as { claimed: number; outcomes: Record<string, number> };
    expect(result.outcomes['failed'] ?? 0).toBe(0);
    if (result.outcomes['pending']) {
      const failures = await db.from('decision_work_items').select('contract,last_error').eq('status','pending');
      throw new Error(`Product work did not complete: ${JSON.stringify(failures.data)}`);
    }
    if (!result.claimed) return;
  }
  throw new Error('Durable work did not settle');
}
async function indexed(account: string, source: string) {
  for (let i = 0; i < 100; i++) {
    const result = await db.from('semantic_indexes').select('source_id').eq('account_id', account).eq('source_id', source); check(result.error);
    if (result.data?.length) return;
    await Bun.sleep(50);
  }
  throw new Error('Product did not index its source');
}

test.skipIf(!enabled)('product pipeline, claimed work and agent consume the same indexed sources through the domain', async () => {
  await import('../apps/api/src/functions/pipeline/tier1-fast-path');
  await import('../apps/api/src/functions/pipeline/decision-workflows');
  await import('../apps/api/src/functions/semantic-indexing');
  const { consultTicketAssistant } = await import('../apps/api/src/lib/ticket-assistant');
  const { sharedAgentTools } = await import('../apps/api/src/lib/agent-tools');
  const { workflow } = await import('../apps/api/src/routes/v1/workflow');
  const userEmail = `${randomUUID()}@acme.com`, password = `Acme-${randomUUID()}`;
  const created = await db.auth.admin.createUser({ email: userEmail, password, email_confirm: true }); check(created.error);
  const userId = created.data.user!.id;
  const login = createSemanticTestClient(target!);
  const signed = await login.auth.signInWithPassword({ email: userEmail, password }); check(signed.error);
  const authorization = `Bearer ${signed.data.session!.access_token}`;
  const provisioned = await db.rpc('provision_account_for_user', { p_user_id: userId, p_account_name: 'Acme' }); check(provisioned.error);
  const account = provisioned.data!;
  fixtureAccount = account;
  const configured = await db.from('accounts').update({ language: 'en', business_context: 'Acme provides account access support.' })
    .eq('id', account).select('plan_id').single(); check(configured.error);
  check((await db.from('channel_integrations').insert({ account_id: account, provider: 'gmail', external_account_id: 'support@acme.com' })).error);
  check((await db.from('oauth_credentials').insert({ account_id: account, provider: 'gmail', external_account_id: 'support@acme.com',
    access_token_enc: 'acme-fixture-token', expires_at: new Date(Date.now() + 3_600_000).toISOString() })).error);
  mail = `acme-${randomUUID()}`;
  await execute('tier1-fast-path', { userId, gmailAccessToken: 'acme-fixture-token' });
  for (const event of events.filter(event => event.name === 'embeddings/index.requested')) await execute('semantic-indexing', event.data);
  const tickets = await db.from('tickets').select('id,conversation_id,classification_tier').eq('account_id', account); check(tickets.error);
  expect(tickets.data).toHaveLength(1);
  const ticketId = tickets.data![0]!.id;
  expect(tickets.data![0]!.conversation_id).toBeTruthy(); expect(tickets.data![0]!.classification_tier).toBe(1);
  await indexed(account, ticketId);
  const jobs = await db.from('decision_work_items').select('contract,status').eq('account_id', account); check(jobs.error);
  expect(jobs.data).toContainEqual(expect.objectContaining({ contract: 'historical_learning', status: 'pending' }));
  expect(events.some(event => event.name === 'decisions/work.requested')).toBe(true);
  await drain();
  const articles = await db.from('kb_articles').select('id,is_published').eq('account_id', account); check(articles.error);
  expect(articles.data).toHaveLength(1); expect(articles.data![0]!.is_published).toBe(false);
  article = articles.data![0]!.id;
  const tools = sharedAgentTools({ feature: 'semantic_eval', accountId: account, ticketId, userId });
  const read = () => tools['read_account_memory']!.execute({ query: `${title}\n${text}` });
  expect((await read()).data['approvedKnowledge']).toEqual([]);
  const version = await db.from('latest_knowledge').select('id').eq('source_id', article).single(); check(version.error);
  const review = async (versionId: string, decision: 'approved' | 'pending_review') => workflow.request(`/knowledge/${article}/review`, {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'article', versionId, decision, ...(decision === 'approved' ? { title, content: text } : {}) }),
  });
  expect((await review(version.data!.id, 'approved')).status).toBe(200);
  await drain();
  const current = await db.from('current_knowledge').select('id').eq('source_id', article).single(); check(current.error);
  const versionId = current.data!.id; await indexed(account, versionId);
  if (telemetry) {
    const { createBackendSemanticService } = await import('../apps/api/src/lib/semantic-service');
    const service = createBackendSemanticService({ db, scope: { accountId: account,
      actor: { kind: 'user', id: userId }, permissions: ['retrieve','index'] } });
    expect(await service.inspectCoverage({ sources: [{ kind: 'ticket', id: ticketId }, { kind: 'knowledge_version', id: versionId }] }))
      .toMatchObject({ denominator: 2, ready: 2, ratio: 1 });
    expect(await service.inspectCoverage()).toMatchObject({ denominator: null, ratio: null });
  }
  expect((await read()).data['approvedKnowledge']).toContainEqual(expect.objectContaining({ id: article, version: versionId }));
  const answer = await consultTicketAssistant({ accountId: account, ticketId, userId,
    messages: [{ role: 'user', content: 'Draft a reply using approved knowledge.' }] });
  expect(answer?.operations.map(operation => operation.tool)).toEqual(['inspect_ticket', 'draft_reply']);
  expect(answer!.operations[1]!.result).toMatchObject({ status: 'proposed', authorization: 'human_review' });
  const history = await db.from('ticket_decision_history').select('contract,result').eq('account_id', account); check(history.error);
  expect(history.data).toContainEqual(expect.objectContaining({ contract: 'historical_learning' }));
  expect(history.data).toContainEqual(expect.objectContaining({ contract: 'reply_suggestion', result: expect.objectContaining({
    sources: expect.arrayContaining([expect.objectContaining({ id: article, version: versionId })]) }) }));
  const foreign = randomUUID(); check((await db.from('accounts').insert({ id: foreign, slug: foreign, name: 'Acme', plan_id: configured.data!.plan_id })).error);
  expect(await consultTicketAssistant({ accountId: foreign, ticketId, userId, messages: [{ role: 'user', content: 'Read the case.' }] })).toBeNull();
  expect((await sharedAgentTools({ feature: 'semantic_eval', accountId: foreign })['read_account_memory']!.execute({ query: `${title}\n${text}` })).data['approvedKnowledge']).toEqual([]);
  expect((await review(versionId, 'pending_review')).status).toBe(200); await drain();
  expect((await read()).data['approvedKnowledge']).toEqual([]);
  const settled = await db.from('decision_work_items').select('status').eq('account_id', account); check(settled.error);
  expect(settled.data!.every(job => job.status === 'done')).toBe(true);
  expect(steps).toContain('decision-workflows:claim-work');
  for (const count of Object.values(calls)) expect(count).toBeGreaterThan(0);
  const observability = await telemetry?.verify([account, ticketId, article, versionId, userId, title, text, userEmail, password, 'acme-fixture-token']);
  console.log(JSON.stringify({ semanticFlow: true, calls, steps, storage: 'real_local_supabase',
    ...(observability ? { observability } : {}),
    embedding: realVectors ? 'real_local_ollama' : 'simulated_transport',
    simulated: ['gmail', 'inngest_scheduler', 'language_and_decision_responses'], relevanceQuality: 'not_measured' }));
}, 300_000);
