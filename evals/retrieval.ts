import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SemanticScope } from '../packages/intelligence/src/embeddings/service';
import { retrievalDocuments, retrievalCases } from './retrieval-cases';
import { summarizeRetrieval, compareRetrieval, retrievalRecommendation, type RankedObservation } from './retrieval-metrics';
import { createEvaluationRun, finishEvaluationRun, findEvaluationRun } from './results';
import { readPrivate, writePrivate, root } from './private-files';

const seed = 215;
const thresholds = [-1, 0.25, 0.50, 0.65, 0.70, 0.75, 0.80, 0.85];
const limits = [2, 3, 12];
const definitions = [
  { source: 'ticket' as const, purpose: 'similar_cases' as const },
  { source: 'knowledge_version' as const, purpose: 'approved_knowledge' as const },
];
function check(error: { code?: string } | null) {
  if (error) throw new Error(`Retrieval fixture operation failed (${error.code ?? 'unknown'})`);
}
function requireCondition(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function execute() {
  const { localSupabaseTarget, createSemanticTestClient } = await import('../apps/api/src/test-support/local-supabase');
  const target = localSupabaseTarget();
  requireCondition(target, 'The existing local Supabase is required');
  const { resolveModelRoute, configuredEmbeddingDimensions, SEMANTIC_SOURCE_DEFINITIONS } = await import('../packages/intelligence/src/index');
  const { createBackendSemanticService } = await import('../apps/api/src/lib/semantic-service');
  const { RELATED_CONTEXT_THRESHOLD, RESOLVED_STATUS_FILTER } = await import('../apps/api/src/lib/ticket-context');
  const { env } = await import('../packages/env');
  const route = resolveModelRoute('embedding');
  requireCondition(route.provider === 'ollama', 'This execution authorizes only local Ollama; remote inference is refused');
  const ollama = new URL(process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434');
  requireCondition(ollama.protocol === 'http:' && ['localhost','127.0.0.1'].includes(ollama.hostname) && ollama.port === '11434', 'Only the existing local Ollama endpoint is allowed');
  const space = { provider: route.provider, model: route.model, dimensions: configuredEmbeddingDimensions() };
  const cases = retrievalCases();
  const fingerprint = createHash('sha256').update(JSON.stringify({ documents: retrievalDocuments, cases })).digest('hex');
  const run = await createEvaluationRun('retrieval', 'synthetic');
  const originalFetch = globalThis.fetch;
  let modelCalls = 0;
  globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== new URL(target.url).origin && url.origin !== ollama.origin) throw new Error('Retrieval eval rejected a non-local network destination');
    if (url.origin === ollama.origin && url.pathname === '/api/embeddings') modelCalls++;
    return originalFetch(input, { ...init, redirect: 'error' });
  }, originalFetch);
  const db = createSemanticTestClient(target);
  const accounts: string[] = [];
  const manifest = { seed, dataset: 'synthetic', fingerprint, space,
    preparations: Object.fromEntries(definitions.map(row => [row.source, SEMANTIC_SOURCE_DEFINITIONS[row.source].preparation])),
    thresholds, limits, documents: retrievalDocuments, cases,
    thresholdControl: '-1 includes all cosine scores to distinguish ranking quality from threshold rejection; it is not a deployment recommendation.',
    judgments: 'independently authored synthetic controls, fixed before search',
    adapter: 'real Supabase REST and production semantic RPCs', simulated: [] as string[],
    sourceLimitations: { kb_article: 'Current article writes create knowledge versions; legacy unversioned articles are not a labeled population in this benchmark.' },
    environment: 'existing local Supabase and Ollama; no schema installation',
    cost: { providerBilledUsd: 0, infrastructureUsd: null, tokens: null },
    timing: 'Sequential calls in one warm process; wall-clock includes model and storage latency.' };
  const observations: Array<RankedObservation & { source: string; purpose: string; profile: { threshold: number; limit: number }; reasons: string[]; matches: unknown[] }> = [];
  await writePrivate(resolve(run.directory, 'manifest.json'), manifest);
  let completed = false;
  const started = performance.now();
  try {
    const plan = await db.from('plans').select('id').eq('code','starter').single(); check(plan.error);
    requireCondition(plan.data, 'Existing fixture plan unavailable');
    async function account() {
      const id = randomUUID();
      check((await db.from('accounts').insert({ id, slug: id, name: 'Acme', plan_id: plan.data!.id })).error);
      accounts.push(id); return id;
    }
    const own = await account(), foreign = await account();
    const scope = (accountId = own, permissions: SemanticScope['permissions'] = ['index','retrieve']): SemanticScope =>
      ({ accountId, actor: { kind: 'workflow', id: 'retrieval_eval' }, permissions });
    const service = (profile?: { threshold: number; limit: number }, accountId = own, permissions?: SemanticScope['permissions']) =>
      createBackendSemanticService({ db, scope: scope(accountId, permissions), space,
        profile: { threshold: profile?.threshold ?? -1, statusFilter: RESOLVED_STATUS_FILTER } });
    async function index(kind: string, id: string, accountId = own) {
      const result = await service(undefined, accountId).indexSource({ source: { kind, id } });
      requireCondition(result.status === 'indexed' || result.status === 'unchanged', 'Real fixture indexing failed');
    }
    async function article(title: string, content: string, accountId = own, published = true, review = 'approved') {
      const id = randomUUID();
      check((await db.from('kb_articles').insert({ id, account_id: accountId, title, content, is_published: published, review_status: review })).error);
      return { id, version: await latest(id, accountId) };
    }
    async function latest(id: string, accountId = own) {
      const result = await db.from('latest_knowledge').select('id').eq('source_id',id).eq('account_id',accountId).single(); check(result.error);
      requireCondition(result.data, 'Fixture knowledge version missing'); return result.data.id as string;
    }
    const mapping: Record<string, Record<string, string>> = { ticket: {}, knowledge_version: {} };
    for (const doc of retrievalDocuments) {
      const ticket = randomUUID();
      check((await db.from('tickets').insert({ id: ticket, account_id: own, subject: doc.title, body_plain: doc.body,
        resolution_summary: doc.body, status: 'resolved' })).error);
      const knowledge = await article(doc.title, doc.body);
      mapping['ticket']![ticket] = doc.key;
      mapping['knowledge_version']![knowledge.version] = doc.key;
      await index('ticket',ticket); await index('knowledge_version',knowledge.version);
    }
    const coverage = await service().inspectCoverage({ sources: definitions.flatMap(({ source }) => Object.keys(mapping[source]!).map(id => ({ kind: source, id }))) });
    requireCondition(coverage.ready === retrievalDocuments.length * definitions.length && coverage.ratio === 1, 'Benchmark indices are not current and compatible');
    const foreignTicket = randomUUID(), twin = retrievalDocuments[0]!;
    check((await db.from('tickets').insert({ id: foreignTicket, account_id: foreign, subject: twin.title, body_plain: twin.body, status: 'resolved' })).error);
    const foreignArticle = await article(twin.title,twin.body,foreign);
    await index('ticket',foreignTicket,foreign); await index('knowledge_version',foreignArticle.version,foreign);

    const baselines = { ticket: { threshold: RELATED_CONTEXT_THRESHOLD, limit: 2 },
      knowledge_version: { threshold: env.EMBEDDING_SIMILARITY_THRESHOLD, limit: 12 } };
    await writePrivate(resolve(run.directory,'manifest.json'), { ...manifest, baselines, indices: coverage, mapping });
    const comparisons = [];
    const summaries: ReturnType<typeof summarizeRetrieval>[] = [];
    for (const definition of definitions) {
      const baseline = baselines[definition.source];
      const profiles = [...new Map([baseline, ...thresholds.flatMap(threshold => limits.map(limit => ({ threshold, limit })))].map(profile => [JSON.stringify(profile),profile])).values()];
      const groups = [];
      for (const profile of profiles) {
        const rows: typeof observations = [];
        // Rotate cases deterministically so one query is not always the cold call.
        const offset = (seed + profiles.indexOf(profile)) % cases.length;
        for (const example of [...cases.slice(offset), ...cases.slice(0,offset)]) {
          const before = performance.now();
          const result = await service(profile).retrieve({ purpose: definition.purpose, sources: [definition.source], query: { text: example.query }, limit: profile.limit });
          for (const match of result.matches) {
            requireCondition(match.source.kind === definition.source && match.source.id in mapping[definition.source]!, 'Isolation or eligible-source guarantee failed');
            requireCondition(match.authority === (definition.source === 'ticket' ? 'historical_case' : 'approved_knowledge') &&
              match.method === 'semantic' && (definition.source !== 'knowledge_version' || match.version === match.source.id), 'Retrieval authority or version guarantee failed');
          }
          const row = { judgment: example.judgment, status: result.status, returned: result.matches.map(match => mapping[definition.source]![match.source.id]!),
            limit: profile.limit, latencyMs: performance.now()-before, source: definition.source, purpose: definition.purpose, profile,
            reasons: [...new Set([result.reason,...result.sources.map(source => source.reason)].filter((reason): reason is NonNullable<typeof reason> => !!reason))],
            matches: result.matches.map(match => ({ source: match.source, similarity: match.similarity ?? null, method: match.method, authority: match.authority })) };
          rows.push(row); observations.push(row);
        }
        rows.sort((a,b) => a.judgment.id.localeCompare(b.judgment.id));
        const summary = summarizeRetrieval(rows, seed);
        summaries.push(summary); groups.push({ profile, rows, summary });
      }
      const baselineRows = groups.find(group => group.profile.threshold === baseline.threshold && group.profile.limit === baseline.limit)!.rows;
      comparisons.push({ ...definition, baseline, profiles: groups.map(group => ({ profile: group.profile, summary: group.summary,
        versusBaseline: compareRetrieval(baselineRows,group.rows,seed) })) });
    }

    const safety: Record<string, boolean> = {};
    for (const definition of definitions) {
      const found = await service().retrieve({ purpose: definition.purpose, sources: [definition.source], query: { text: twin.body }, limit: 50 });
      safety[`${definition.source}_account_isolation`] = found.status === 'ok' && found.matches.length === retrievalDocuments.length &&
        found.matches.every(match => match.source.id in mapping[definition.source]!);
      const denied = await service(undefined,own,[]).retrieve({ purpose: definition.purpose, sources: [definition.source], query: { text: twin.body } });
      safety[`${definition.source}_permission`] = denied.status === 'unavailable' && denied.reason === 'forbidden' && denied.matches.length === 0;
      const incompatible = createBackendSemanticService({ db, scope: scope(), space: { ...space, model: `${space.model}:incompatible` }, profile: { threshold: -1 } });
      const result = await incompatible.retrieve({ purpose: definition.purpose, sources: [definition.source], query: { text: twin.body } });
      safety[`${definition.source}_vector_space`] = result.status === 'unavailable' && result.matches.length === 0 && result.sources.some(row => row.reason === 'index_incompatible');
    }
    const forbiddenVersions: string[] = [];
    for (const status of ['pending_review','rejected']) {
      const control = await article(twin.title,twin.body,own,false,status);
      forbiddenVersions.push(control.version);
      const result = await service().indexSource({ source: { kind: 'knowledge_version', id: control.version } });
      safety[status] = result.status === 'failed' && result.reason === 'not_found';
    }
    for (const action of ['withdrawn','superseded']) {
      const control = await article(twin.title,twin.body);
      await index('knowledge_version',control.version); forbiddenVersions.push(control.version);
      check((await db.from('kb_articles').update(action === 'withdrawn' ? { is_published: false } : { content: 'Updated invented account recovery procedure.' }).eq('id',control.id).eq('account_id',own)).error);
      if (action === 'superseded') await index('knowledge_version',await latest(control.id));
      const found = await service().retrieve({ purpose: 'approved_knowledge', sources: ['knowledge_version'], query: { text: twin.body }, limit: 50 });
      safety[action] = found.status === 'ok' && !found.matches.some(match => forbiddenVersions.includes(match.source.id));
    }
    const stale = Object.keys(mapping['ticket']!)[0]!;
    check((await db.from('tickets').update({ body_plain: 'Updated invented case; the previous vector is obsolete.' }).eq('id',stale).eq('account_id',own)).error);
    const staleResult = await service().retrieve({ purpose: 'similar_cases', sources: ['ticket'], query: { text: twin.body }, limit: 50 });
    safety['stale_revision'] = staleResult.status !== 'ok' && !staleResult.matches.some(match => match.source.id === stale) && staleResult.sources.some(row => row.reason === 'index_incompatible');
    const safetyPassed = Object.values(safety).every(Boolean);
    const recommendation = retrievalRecommendation({ synthetic: true, safetyPassed, summaries });
    const report = { passed: safetyPassed && recommendation.evidenceUsable, qualityStatus: 'measured_not_approved', fingerprint, seed, space, comparisons, safety, recommendation,
      modelCalls, durationMs: performance.now()-started, cost: manifest.cost,
      limitations: ['Synthetic controls do not establish customer relevance.', 'No remote provider, legacy unversioned article population or live scheduler is evaluated.',
        'Bootstrap intervals describe this small synthetic query population; they are not calibrated model confidence.'] };
    await writePrivate(resolve(run.directory,'observations.json'),observations);
    await writePrivate(resolve(run.directory,'report.json'),report);
    completed = report.passed;
    console.log(JSON.stringify({ retrieval: true, passed: completed, qualityStatus: report.qualityStatus, queries: cases.length * definitions.length,
      profiles: comparisons.map(row => ({ source: row.source, count: row.profiles.length })), observations: observations.length,
      baselines: comparisons.map(row => ({ source: row.source, profile: row.baseline,
        metrics: Object.fromEntries(Object.entries(row.profiles.find(profile => profile.profile.threshold === row.baseline.threshold && profile.profile.limit === row.baseline.limit)!.summary.metrics)
          .map(([name,value]) => [name,value.score])) })),
      safety, recommendation, modelCalls, run: run.directory }));
    if (!completed) process.exitCode = 1;
  } catch (error) {
    await writePrivate(resolve(run.directory,'failure.json'), { message: error instanceof Error ? error.message : 'Retrieval evaluation failed' });
    throw error;
  } finally {
    try { if (accounts.length) check((await db.from('decision_work_items').delete().in('account_id',accounts)).error); }
    finally { globalThis.fetch = originalFetch; await finishEvaluationRun(run, completed ? 'completed' : 'failed'); }
  }
}

export async function retrievalMain(args: string[]) {
  const [command, dataset, selector = 'latest'] = args;
  if (dataset !== 'synthetic' || !['plan','execute','report'].includes(command ?? '') || args.length > (command === 'report' ? 3 : 2)) throw new Error('Use retrieval.ts plan|execute|report synthetic [run]');
  if (command === 'plan') return { dataset, seed, sources: definitions, queries: retrievalCases().length * definitions.length,
    thresholds, limits, adapter: 'real local Supabase', provider: 'configured local Ollama through the existing integration runner', network: false, inference: false };
  if (command === 'report') return JSON.parse(await readPrivate(resolve((await findEvaluationRun('retrieval','synthetic',selector)).directory,'report.json'))) as unknown;
  if (process.env['RUN_SUPABASE_INTEGRATION'] !== '1') {
    const child = spawnSync(process.execPath,['--no-env-file','scripts/test-semantic-integration.ts','--retrieval-quality','--ollama'], { cwd: root, env: process.env, stdio: 'inherit' });
    process.exitCode = child.status ?? 1; return;
  }
  await execute();
}
if (import.meta.main) {
  try { const output = await retrievalMain(process.argv.slice(2)); if (output !== undefined) console.log(JSON.stringify(output)); }
  catch { console.error('Retrieval evaluation failed; inspect the private run artifacts.'); process.exitCode = 1; }
}
