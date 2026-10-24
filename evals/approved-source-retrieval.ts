import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { loadCorpus } from './corpus';
import { readPrivate, writePrivate, privateRoot } from './private-files';
import { createEvaluationRun, findEvaluationRun, finishEvaluationRun } from './results';
import { semanticStorage } from './semantic-storage';
import { reviewedMemory, type MemoryProposal } from './enrichment-memory';
import { OllamaEmbeddingProvider } from '../packages/intelligence/src/providers/ollama/embedding';
import { SEMANTIC_SOURCE_DEFINITIONS, type VectorSpace } from '../packages/intelligence/src/embeddings';

type SourceEmail = { id: number; subject: string; body: string };
export function approvedSourceCases(original: MemoryProposal[], review: MemoryProposal[], emails: SourceEmail[]) {
  reviewedMemory(original,review,emails.map(row => row.id));
  const approved = review.filter(row => row.decision === 'approved');
  if (new Set(approved.map(row => row.id)).size !== approved.length) throw new Error('Duplicate approved references');
  const documents = approved.map(row => {
    const source = original.find(item => item.id === row.id)!;
    if (row.title !== source.title || !emails.some(email => email.id === row.sourcePosition)) throw new Error('Approved source identity changed');
    return { id: `acme-approved-version-${row.id}`, sourcePosition: row.sourcePosition,
      snapshot: { title: row.title, content: row.content } };
  });
  const cases = [...new Set(documents.map(row => row.sourcePosition))].sort((a,b) => a-b).map(position => {
    const email = emails.find(row => row.id === position)!;
    const text = [email.subject,email.body].filter(Boolean).join('\n\n');
    if (!text.trim()) throw new Error('Approved source query is empty');
    return { position, query: text.slice(0,2000), truncated: text.length > 2000,
      expected: documents.filter(row => row.sourcePosition === position).map(row => row.id) };
  });
  return { documents, cases };
}
export type ApprovedSourceInput = ReturnType<typeof approvedSourceCases>;

export function knownSourceMetrics(rows: Array<{ position: number; expected: string[]; returned: string[]; status: string }>) {
  const eligible = rows.filter(row => row.status === 'ok');
  const expected = rows.reduce((sum,row) => sum + row.expected.length,0);
  const hits = eligible.reduce((sum,row) => sum + row.expected.filter(id => row.returned.includes(id)).length,0);
  const hitQueries = eligible.filter(row => row.expected.some(id => row.returned.includes(id))).length;
  const fullyRecovered = eligible.filter(row => row.expected.every(id => row.returned.includes(id))).length;
  return { queries: rows.length, available: eligible.length, expectedSourceLinks: expected, recoveredSourceLinks: hits,
    knownSourceRecall: eligible.length === rows.length && expected ? hits / expected : null,
    queriesWithKnownSource: hitQueries, fullyRecoveredQueries: fullyRecovered,
    sourceHitRate: eligible.length === rows.length && rows.length ? hitQueries / rows.length : null,
    meanKnownSourceReciprocalRank: eligible.length === rows.length && rows.length ? eligible.reduce((sum,row) => {
      const rank = row.returned.findIndex(id => row.expected.includes(id)); return sum + (rank < 0 ? 0 : 1/(rank+1));
    },0)/rows.length : null,
    precision: null, noAnswerAccuracy: null, unjudgedResultsAreNegative: false,
    passed: rows.length > 0 && eligible.length === rows.length && fullyRecovered === rows.length };
}

export async function evaluateApprovedSources(input: ApprovedSourceInput, embed: (text: string) => Promise<number[]>, space: VectorSpace) {
  if (!input.documents.length || !input.cases.length) throw new Error('No approved source cases');
  const account = 'acme-source-recovery';
  const store = { tables: { knowledge_versions: input.documents.map(doc => ({ id: doc.id, source_id: doc.id,
    account_id: account, source_kind: 'article', revision: 1, status: 'approved', snapshot: doc.snapshot })) }, writes: [] } as Parameters<typeof semanticStorage>[0];
  const storage = semanticStorage(store);
  const create = (threshold: number, permission: readonly ('index'|'retrieve')[] = ['index','retrieve']) => storage.service({
    // The existing memory port does not access a Supabase client.
    db: {} as Parameters<typeof storage.service>[0]['db'],
    scope: { accountId: account, actor: { kind: 'workflow', id: 'approved_source_eval' }, permissions: permission },
    space, embed, profile: { threshold },
  });
  for (const document of input.documents) {
    const indexed = await create(0.8).indexSource({ source: { kind: 'knowledge_version', id: document.id } });
    if (indexed.status !== 'indexed') throw new Error('Approved source indexing failed');
  }
  const coverage = await create(0.8).inspectCoverage({ sources: input.documents.map(doc => ({ kind: 'knowledge_version', id: doc.id })) });
  if (coverage.ready !== input.documents.length || coverage.ratio !== 1) throw new Error('Approved source indices are not compatible');
  const identityChecks = [];
  for (const document of input.documents) {
    const text = SEMANTIC_SOURCE_DEFINITIONS.knowledge_version.prepare(document.snapshot);
    const result = await create(0.8).retrieve({ purpose: 'approved_knowledge', query: { text },
      sources: ['knowledge_version'], limit: 50 });
    const match = result.matches.find(row => row.version === document.id);
    identityChecks.push({ id: document.id, available: result.status === 'ok',
      passed: result.status === 'ok' && match?.method === 'semantic' &&
        match.authority === 'approved_knowledge' && Math.abs((match.similarity ?? 0) - 1) < 1e-6 });
  }
  const technicalChecks = { compatibleIndices: coverage.ready,
    identityQueries: identityChecks.length, recoveredIdentities: identityChecks.filter(row => row.passed).length,
    passed: identityChecks.every(row => row.passed),
    scope: 'Identical prepared inputs must retrieve their indexed version with cosine similarity near one; this is not a relevance judgment.' };
  const profiles = [
    { name: 'current_knowledge_profile', threshold: 0.8, limit: 12 },
    { name: 'synthetic_candidate_control', threshold: 0.25, limit: 2 },
    { name: 'unfiltered_ranking_control', threshold: -1, limit: Math.min(50,input.documents.length) },
    { name: 'minimum_threshold_same_limit', threshold: -1, limit: 12 },
  ];
  const observations = [];
  const comparisons = [];
  for (const profile of profiles) {
    const service = create(profile.threshold);
    const rows = [];
    for (const example of input.cases) {
      const started = performance.now();
      const result = await service.retrieve({ purpose: 'approved_knowledge', query: { text: example.query }, sources: ['knowledge_version'], limit: profile.limit });
      if (result.matches.some(match => match.authority !== 'approved_knowledge' || !input.documents.some(doc => doc.id === match.version))) throw new Error('Approved source authority failed');
      const row = { position: example.position, expected: example.expected, returned: result.matches.map(match => match.version!),
        status: result.status, reason: result.reason ?? result.sources.find(source => source.reason)?.reason ?? null,
        latencyMs: performance.now()-started, queryTruncated: example.truncated,
        matches: result.matches.map(match => ({ id: match.version, similarity: match.similarity ?? null })) };
      rows.push(row); observations.push({ profile: profile.name,...row });
    }
    comparisons.push({ profile, metrics: knownSourceMetrics(rows) });
  }
  return { passed: technicalChecks.passed && comparisons[0]!.metrics.passed,
    technicalChecks, identityChecks, comparisons, coverage, observations,
    preparations: { knowledge: SEMANTIC_SOURCE_DEFINITIONS.knowledge_version.preparation, query: 'source subject and body, first 2000 characters' },
    boundaries: { service: 'production public embeddings domain', embeddings: 'injected provider',
      persistenceAndSearch: 'existing semanticStorage memory adapter; Supabase RPCs and SQL ranking are not exercised' },
    interpretation: 'Known source recovery checks grounding references, not downstream business relevance; unjudged matches are not false positives.' };
}

export async function approvedSourceMain(args: string[]) {
  const [command,dataset,selector = 'latest'] = args;
  if (!['plan','execute','report'].includes(command ?? '') || dataset !== 'main' || args.length > (command === 'report' ? 3 : 2)) throw new Error('Use approved-source-retrieval.ts plan|execute|report main [run]');
  if (command === 'report') {
    const run = await findEvaluationRun('retrieval','main',selector);
    const report = JSON.parse(await readPrivate(resolve(run.directory,'report.json')));
    if (report.evaluation !== 'approved_source_retrieval') throw new Error('Wrong retrieval evaluation');
    return report.summary;
  }
  const directory = resolve(privateRoot,'input/knowledge-labels/main');
  const original = JSON.parse(await readPrivate(resolve(directory,'source-proposals.json'))) as MemoryProposal[];
  const review = JSON.parse(await readPrivate(resolve(directory,'review.json'))) as { proposals: MemoryProposal[] };
  const input = approvedSourceCases(original,review.proposals,await loadCorpus('main'));
  const space = { provider: 'ollama', model: 'nomic-embed-text-v2-moe', dimensions: 768 };
  const plan = { evaluation: 'approved_source_retrieval', approvedKnowledge: input.documents.length, sourceQueries: input.cases.length,
    space, maximumEmbeddingRequests: 2 * (input.documents.length + input.cases.length),
    inference: 'only existing local Ollama; no classification or knowledge generation', providerBilledUsd: 0 };
  if (command === 'plan') return plan;
  const run = await createEvaluationRun('retrieval','main');
  const cachePath = resolve(privateRoot,'output/evals/retrieval/main/approved-source-embeddings.json');
  let cache: Record<string,number[]> = {};
  try { cache = JSON.parse(await readPrivate(cachePath)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Private embedding cache unavailable'); }
  const originalFetch = globalThis.fetch;
  let requests = 0;
  const httpStatuses: Record<number,number> = {};
  let contextLengthFailures = 0;
  let boundedEmbeddingRequests = 0;
  const failedInputs = new Set<string>();
  globalThis.fetch = Object.assign(async (request: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(request instanceof Request ? request.url : String(request));
    const metadata = url.pathname === '/api/tags' && (init?.method ?? 'GET') === 'GET';
    if (url.origin !== 'http://127.0.0.1:11434' || !(metadata || ['/api/embeddings','/api/embed'].includes(url.pathname) && init?.method === 'POST')) throw new Error('Only local embedding inference is allowed');
    if (!metadata) {
      if (requests >= plan.maximumEmbeddingRequests) throw new Error('Local embedding request budget exceeded');
      requests++;
      if (url.pathname === '/api/embed') boundedEmbeddingRequests++;
    }
    const response = await originalFetch(request,{ ...init,redirect: 'error' });
    if (!metadata) {
      httpStatuses[response.status] = (httpStatuses[response.status] ?? 0)+1;
      if (!response.ok && /context length|input length|too (?:long|large)|maximum.*(?:context|tokens)/i.test(await response.clone().text())) contextLengthFailures++;
    }
    return response;
  },originalFetch);
  const provider = new OllamaEmbeddingProvider('http://127.0.0.1:11434',space.model,space.dimensions);
  let passed = false;
  try {
    const metadata = await fetch('http://127.0.0.1:11434/api/tags',{ signal: AbortSignal.timeout(10_000) });
    if (!metadata.ok) throw new Error('Local model metadata unavailable');
    const tags = await metadata.json() as { models?: Array<{ name: string; digest: string }> };
    const digest = tags.models?.find(model => model.name === space.model || model.name === `${space.model}:latest`)?.digest;
    if (!digest) throw new Error('Local embedding model identity unavailable');
    await writePrivate(resolve(run.directory,'manifest.json'),{ ...plan,input,modelDigest: digest,
      inputFingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex') });
    const result = await evaluateApprovedSources(input,async text => {
      const key = createHash('sha256').update(JSON.stringify([space,digest,'legacy-with-context-fallback-v1',text])).digest('hex');
      const value = cache[key];
      if (value && value.length === space.dimensions && value.every(Number.isFinite) && value.some(v => v !== 0)) return [...value];
      if (failedInputs.has(key)) throw new Error('Embedding failed for this input; not repeating inference across profiles');
      try {
        const vector = await provider.embed(text);
        cache[key] = vector; await writePrivate(cachePath,cache); return [...vector];
      } catch (error) { failedInputs.add(key); throw error; }
    },space);
    passed = result.passed;
    const summary = { evaluation: plan.evaluation, completed: true, passed, approvedKnowledge: input.documents.length, sourceQueries: input.cases.length,
      technicalChecks: result.technicalChecks,
      comparisons: result.comparisons, localEmbeddingRequests: requests, httpStatuses,legacyContextRejections: contextLengthFailures,boundedEmbeddingRequests,providerBilledUsd: 0,
      providerContextHandling: 'Inputs rejected by the legacy endpoint use /api/embed with truncate=true; Ollama limits the trailing input to the model context.',
      infrastructureCostUsd: null, productConfigurationChanged: false, persistence: 'existing memory adapter', run: run.directory };
    await writePrivate(resolve(run.directory,'report.json'),{ evaluation: plan.evaluation,...result,summary,space });
    if (!passed) process.exitCode = 1;
    return summary;
  } catch {
    await writePrivate(resolve(run.directory,'report.json'),{ evaluation: plan.evaluation,
      summary: { completed: false,passed: false,error: 'Approved source evaluation failed; no private content is emitted' } });
    throw new Error('Approved source evaluation failed; inspect the private report');
  } finally {
    globalThis.fetch = originalFetch;
    await finishEvaluationRun(run,passed ? 'completed' : 'failed');
  }
}
if (import.meta.main) {
  try { console.log(JSON.stringify(await approvedSourceMain(process.argv.slice(2)))); }
  catch { console.error('Approved source evaluation failed; inputs and diagnostics remain private.'); process.exitCode = 1; }
}
