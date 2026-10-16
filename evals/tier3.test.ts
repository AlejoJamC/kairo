import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import type { EvalCase } from './cases';
import type { OnboardingOverrides } from './onboarding-runtime';
import { onboardingStorage, accountId, userId } from './onboarding-storage';
import { createDeferredScenario, selectDeferredCorpus, selectDeferredWindow, type DeferredScenario } from './tier3-scenario';
import { createTier3Runtime } from './tier3-runtime';
import { tier3Main } from './tier3';
import { tier3Routing } from './tier3-routing';
import { readPrivate, writePrivate } from './private-files';
import { resultsRoot } from './results';
import { workflowLanguageInstructions } from '../packages/intelligence/src/classification/workflow-contract';

const transport = globalThis.fetch;
const forbidden = mock(async () => { throw new Error('Technical checks cannot use network'); });
beforeAll(() => { globalThis.fetch = forbidden as unknown as typeof fetch; });
afterAll(() => { globalThis.fetch = transport; expect(forbidden).not.toHaveBeenCalled(); });

function example(id: number, day: string, body: string, headers: Record<string, string> = {}): EvalCase {
  return { id, dataset: 'main', contract: 'onboarding_triage', from: 'client@outside.com', mailbox: 'support@acme.com',
    mailboxes: ['support@acme.com'], to: 'support@acme.com', lang: 'en', subject: `Invented request ${id}`, body,
    headers: { ...(day ? { date: `${day}T12:00:00Z` } : {}), ...headers }, expected: { type: 'support' }, rubric: [] };
}
const first = example(1, '2026-10-12', 'My Acme account rejects my password.', { 'message-id': '<root@acme.com>' });
const corpus = [first,
  example(2, '2026-09-20', 'The recovery link worked. Access is restored.', { references: '<root@acme.com>' }),
  example(3, '2026-09-02', 'Acme accepts returns within 14 days.'),
  example(4, '2026-08-01', 'Invented promotional message.', { 'x-spam-status': 'Yes' }),
  example(5, '2026-06-01', 'An older request outside the window.'),
  example(6, '', 'A request without a reliable date.'),
  example(7, '2026-08-02', 'No reusable information is available.'),
  example(8, '2026-08-03', 'Synthetic analysis failure.'),
  example(9, '2026-08-04', 'Synthetic invalid quotation.'),
  example(10, '2026-10-15', 'Acme accepts returns within 14 days.'),
];
function baseline(): DeferredScenario {
  const storage = onboardingStorage('en');
  storage.tables['tickets']!.push({ id: 'acme-ticket', account_id: accountId, conversation_id: 'acme-conversation',
    status: 'open', case_revision: 1, ticket_number: 1, merged_into_ticket_id: null,
    subject: first.subject, body_plain: first.body, from_email: first.from, gmail_thread_id: 'acme-thread-0',
    ticket_type: 'support', priority: 'P1', category: 'account', sentiment: 'neutral', assigned_to: userId,
    first_viewed_at: '2026-10-12T13:00:00Z', ai_reasoning: 'Human-reviewed decision' });
  storage.tables['messages']!.push({ id: 'acme-message-1', account_id: accountId, conversation_id: 'acme-conversation',
    body_plain: first.body, direction: 'inbound', received_at: first.headers!['date'], processing_tier: 1 });
  storage.tables['conversations']!.push({ id: 'acme-conversation', account_id: accountId, channel_integration_id: 'acme-channel', external_thread_id: 'acme-thread-0' });
  storage.tables['ticket_messages']!.push({ ticket_id: 'acme-ticket', message_id: 'acme-message-1', is_origin: true });
  storage.tables['operational_learning']!.push({ id: 'acme-initial-learning', account_id: accountId, status: 'pending_review', summary: 'An unverified initial observation.' });
  return { tables: storage.tables,
    classified: [{ example: first, ticketId: 'acme-ticket', messageId: 'acme-message-1' }],
    manifest: { dataset: 'main', positions: [1], selected: 1 } };
}
function choice(value: string, options: string[]) {
  return { type: 'choice', choice: value, confidence: 1, probabilities: Object.fromEntries(options.map(option => [option, Number(value === option)])) };
}
function fakes(fail = true) {
  const classify = mock(async () => ({ result: { type: 'support', priority: 'P2', urgency: 'medium', category: 'account', tone: 'neutral', reasoning: 'Invented classification.', confidence: 0.8 },
    verdict: { priority: 'P2', urgency: 'medium', category: 'account', tone: 'neutral' }, ensemble: null, abstain: true,
    meta: { model: 'acme/classifier', rawText: '{}', usage: { promptTokens: 1, completionTokens: 1 } },
    prompt: 'Invented prompt', promptVersion: '1.0.0' }));
  const analyze = mock(async (input: { vars: { sources: string } }) => {
    if (fail && input.vars.sources.includes('Synthetic analysis failure')) throw new Error('Invented analysis failure');
    return { data: { observations: [], missing: ['confirmed_outcome'], waitingOn: null, resumeWhen: null }, model: 'acme/evidence', promptVersion: '1.0.0', llmCallId: null };
  });
  const questions = JSON.parse(workflowLanguageInstructions('backfill')) as Record<string, { criteria: Record<string, string> }>;
  const decide = mock(async () => ({ data: { value: Object.fromEntries(Object.entries(questions).map(([key, question]) =>
    [key, choice('unknown', Object.keys(question.criteria))])), modelVersion: 'acme/decision' }, llmCallId: null }));
  const candidate = mock(async (state: { source: { text: string } }) => ({ value: { candidate: choice(state.source.text.includes('No reusable') ? 'no' : 'yes', ['yes', 'no']) }, model: 'acme/decision', callId: null }));
  const extract = mock(async (input: { source: string; fragments?: { id: string }[] }) => ({ value: { proposals: [{ kind: 'business_fact', title: 'Proposed observation',
    content: 'An observation for human review.', ...(input.fragments ? { evidenceIds: [input.source.includes('Synthetic invalid') ? 'e999' : input.fragments[0]!.id] }
      : { evidence: [input.source.includes('Synthetic invalid') ? 'Invented absent quotation.' : input.source.split('\n').at(-1)!] }) }] }, model: 'acme/draft', callId: null }));
  const validate = mock(async () => ({ value: [{ novelty: choice('new', ['new', 'redundant', 'unknown']),
    support: choice('supported', ['supported', 'unsupported', 'uncertain']), policy: choice('unknown', ['consistent', 'conflict', 'unknown']) }], model: 'acme/validation', callId: null }));
  return { classify, analyze, decide, candidate, extract, validate,
    deps: { classify, work: { analyze, decide, decisionProvider: () => ({ model: 'acme/decision' }) }, knowledge: { candidate, extract, validate } } as unknown as OnboardingOverrides };
}

test('workflow selection admits the corpus without rewriting dates or requiring another evaluation', () => {
  const original = JSON.stringify(corpus);
  const scenario = createDeferredScenario(corpus);
  const selected = selectDeferredCorpus(corpus, scenario);
  expect(selected.cases.map(row => row.id)).toEqual(corpus.map(row => row.id));
  expect(selected.exclusions).toHaveLength(0);
  expect(selected.anchor).toBe('2026-10-15T12:00:00.000Z');
  const undated = corpus.map(row => ({ ...row, headers: {} }));
  expect(selectDeferredCorpus(undated, createDeferredScenario(undated)).cases).toHaveLength(corpus.length);
  expect(JSON.stringify(corpus)).toBe(original);
  expect(() => selectDeferredCorpus([], scenario)).toThrow('EVAL_CORPUS_EMPTY');
  expect(() => selectDeferredCorpus([first], baseline())).toThrow('EVAL_NO_UNPROCESSED_CASES');
});

test('Tier 3 model roles do not inherit another evaluation configuration', () => {
  const configured = { INTELLIGENCE_PROVIDER: 'gateway', TEXT_PROVIDER: 'gateway', AI_GATEWAY_MODEL: 'acme/language',
    AI_GATEWAY_DECISION_MODEL: 'acme/typed', EVAL_TIER2_CLASSIFICATION_MODEL: 'acme/other',
    EVAL_TIER3_CLASSIFICATION_MODEL: 'acme/deferred', EVAL_TIER3_VALIDATION_MODEL: 'acme/validation' };
  const routes = tier3Routing(configured);
  expect(routes.routes[0]!.model).toBe('acme/deferred');
  expect(routes.routes.at(-1)!.model).toBe('acme/validation');
  expect(routes.ensemble).toBeNull();
  expect(configured.EVAL_TIER2_CLASSIFICATION_MODEL).toBe('acme/other');
});

test('calendar boundary gaps remain visible instead of being counted as evaluated', () => {
  const cases = [...corpus,
    example(11, '2026-09-29', 'An invented boundary request.'),
    example(12, '2026-09-14', 'Another invented boundary request.'),
    example(13, '2026-08-15', 'A third invented boundary request.')];
  const selected = selectDeferredWindow(cases, createDeferredScenario(cases), 90);
  expect(selected.coverageGaps).toEqual([11, 12, 13]);
  expect(selected.cases.some(row => [11, 12, 13].includes(row.id))).toBe(false);
});

test('all recent corpus messages reach historical classification and learning without mailbox date filtering', async () => {
  const cases = Array.from({ length: 50 }, (_, index) => example(index + 100, '2026-10-15', 'No reusable information is available.'));
  const fake = fakes(false);
  const scenario = createDeferredScenario(cases);
  const result = await (await createTier3Runtime(selectDeferredCorpus(cases, scenario), scenario, fake.deps)).execute();
  expect(result.classified).toHaveLength(50);
  expect(result.learning.filter(row => row.status === 'completed')).toHaveLength(50);
  expect(fake.classify).toHaveBeenCalledTimes(50);
  expect(fake.analyze).toHaveBeenCalledTimes(50);
  expect(result.steps.some(row => row.step === 'window_selection')).toBe(false);
  expect(result.steps.some(row => row.step === 'historical_ingestion')).toBe(true);
  expect(Object.values(result.safety).every(Boolean)).toBe(true);
});

test('historical closure with no approved knowledge queues no enrichment and approves no proposals', async () => {
  const previous = process.env['FEATURE_FLAG_ENABLE_EMAIL_KNOWLEDGE'];
  process.env['FEATURE_FLAG_ENABLE_EMAIL_KNOWLEDGE'] = 'true';
  try {
    const scenario = createDeferredScenario(corpus);
    const result = await (await createTier3Runtime(selectDeferredCorpus(corpus, scenario), scenario, fakes(false).deps)).execute();
    expect(result.historicalClosure).toEqual({ checked: true, approvedVersions: 0, enqueued: 0 });
    expect(result.writes.filter(row => row.operation === 'enqueue_pending_knowledge')).toHaveLength(1);
    expect(result.tables['current_knowledge']).toHaveLength(0);
    expect(Object.values(result.safety).every(Boolean)).toBe(true);
  } finally { if (previous === undefined) delete process.env['FEATURE_FLAG_ENABLE_EMAIL_KNOWLEDGE']; else process.env['FEATURE_FLAG_ENABLE_EMAIL_KNOWLEDGE'] = previous; }
});

test('scenario checks reject inconsistent source linkage and unapproved knowledge consumption', () => {
  const scenario = baseline();
  scenario.tables['ticket_messages'] = [];
  expect(() => selectDeferredWindow(corpus, scenario, 90)).toThrow('EVAL_SCENARIO_LINKAGE');
  const approved = createDeferredScenario(corpus);
  approved.tables['current_knowledge']!.push({ id: 'acme-version' });
  expect(() => selectDeferredWindow(corpus, approved, 90)).toThrow('EVAL_SCENARIO_KNOWLEDGE_STATE');
});

test('the production Tier 3 job preserves seeded human decisions while historical services analyze full available threads', async () => {
  const fake = fakes();
  const realDate = globalThis.Date;
  const result = await (await createTier3Runtime(selectDeferredCorpus(corpus, baseline()), baseline(), fake.deps)).execute();
  expect(globalThis.Date).toBe(realDate);
  expect(result.classified.map(item => item.example.id).sort((a, b) => a - b)).toEqual([2, 3, 5, 6, 7, 8, 9, 10]);
  expect(fake.classify).toHaveBeenCalledTimes(8);
  for (const call of fake.classify.mock.calls) expect((call as unknown as [{ stage: string }])[0].stage).toBe('backfill');
  expect(result.tables['tickets']!.find(row => row['id'] === 'acme-ticket')).toMatchObject({ priority: 'P1', ai_reasoning: 'Human-reviewed decision' });
  const related = result.learning.find(item => item.case === 2)!;
  expect(related.ticketId).toBe('acme-ticket');
  expect(fake.analyze.mock.calls.some(([input]) => input.vars.sources.includes(first.body) && input.vars.sources.includes(corpus[1]!.body))).toBe(true);
  expect(result.tables['ticket_classification_history']!.every(row => row['occurred_at'] === '2026-10-15T12:00:00.000Z')).toBe(true);
  expect(result.tables['ticket_proposals']!.every(row => row['status'] === 'pending')).toBe(true);
  expect(result.learning.filter(item => item.status === 'completed')).toHaveLength(7);
  expect(result.learning.find(item => item.case === 8)!.status).toBe('failed');
  expect(result.steps.some(step => step.case === 9 && step.step === 'knowledge_proposals' && JSON.stringify(step.output).includes('invalid_source_quote'))).toBe(true);
  expect(result.tables['operational_learning']!.length).toBeGreaterThan(1);
  expect(Object.values(result.safety).every(Boolean)).toBe(true);
  expect(result.events).toEqual([]);
  expect(result.steps.filter(row => row.step === 'historical_ingestion')).toHaveLength(1);
  expect(result.steps.filter(step => step.step === 'idempotency')).toHaveLength(7);
});

test('the command produces private historical reports and review rubrics from corpus input alone without contacting external services', async () => {
  const fake = fakes(false);
  const modelNames = ['INTELLIGENCE_PROVIDER', 'TEXT_PROVIDER', 'CLASSIFICATION_MODE', 'INTELLIGENCE_ENSEMBLE',
    'AI_GATEWAY_CLASSIFICATION_MODEL', 'AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL', 'AI_GATEWAY_KNOWLEDGE_DECISION_MODEL', 'AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL', 'AI_GATEWAY_VALIDATION_MODEL'];
  const previous = modelNames.map(name => process.env[name]);
  Object.assign(process.env, { INTELLIGENCE_PROVIDER: 'gateway', TEXT_PROVIDER: 'gateway', CLASSIFICATION_MODE: 'decision',
    AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/classification', AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL: 'acme/evidence',
    AI_GATEWAY_KNOWLEDGE_DECISION_MODEL: 'acme/decision', AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL: 'acme/draft', AI_GATEWAY_VALIDATION_MODEL: 'acme/validation' });
  delete process.env['INTELLIGENCE_ENSEMBLE'];
  const latest = resolve(resultsRoot, 'tier3/main/latest.json');
  const priorLatest = await readPrivate(latest).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  const print = console.log;
  const output: string[] = [];
  console.log = (value: unknown) => { output.push(String(value)); };
  let directory: string | undefined;
  let emptyDirectory: string | undefined;
  try {
    const preview = await tier3Main(['plan', 'main']);
    expect(preview).toMatchObject({ network: false, contract: 'historical_learning', selection: 'all supplied corpus messages; source dates unchanged' });
    expect((preview as { routes: unknown[] }).routes[0]).toMatchObject({ capability: 'language', model: 'acme/evidence' });
    expect(process.env['CLASSIFICATION_MODE']).toBe('decision');
    await expect(tier3Main(['plan', 'main', '50', 'previous-run'])).rejects.toHaveProperty('code', 'EVAL_ARGUMENTS');
    const result = await tier3Main(['execute', 'main'], { loadCorpus: async () => corpus,
      createRuntime: (selection, saved, _overrides, notify, stopped) => createTier3Runtime(selection, saved, fake.deps, notify, stopped) });
    directory = (result as { directory: string }).directory;
    expect(result).toMatchObject({ selected: 10, classified: 9, learningCompleted: 9, failedCases: 0, requests: 0 });
    const manifest = JSON.parse(await readPrivate(resolve(directory, 'manifest.json')));
    const report = JSON.parse(await readPrivate(resolve(directory, 'report.json')));
    const reviews = JSON.parse(await readPrivate(resolve(directory, 'reviews.json')));
    expect(manifest).toMatchObject({ scenario: 'isolated', selected: 10, maximumLogicalCalls: 60 });
    expect(manifest.baseline).toBeUndefined();
    expect(manifest.baselineMode).toBeUndefined();
    expect(manifest.routes[0]).toMatchObject({ capability: 'language', model: 'acme/evidence' });
    expect(process.env['CLASSIFICATION_MODE']).toBe('decision');
    expect(report).toMatchObject({ requests: 0, failedCases: 0, knowledgeQuality: 'pending human review', infrastructureVerified: false });
    expect(report.quality.classification.type.comparisons.map((row: { threshold: number }) => row.threshold)).toEqual([0.7, 0.8, 0.9]);
    expect(report.quality.proposals.invalidSource).toBe(1);
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((row: { ratings: unknown[] }) => row.ratings.every(value => value === null))).toBe(true);
    expect(output.join(' ')).not.toContain('outside.com');
    expect(output.join(' ')).not.toContain(first.body);
    await expect(tier3Main(['report', 'main', (result as { run: string }).run])).resolves.toHaveProperty('reportUpdated', true);
    const refreshed = JSON.parse(await readPrivate(resolve(directory, 'report.json')));
    expect(refreshed.quality).toEqual(report.quality);
    const emptyRuntime = mock(async () => { throw new Error('Empty input must stop before model runtime setup'); });
    const failure = await tier3Main(['execute', 'main'], { loadCorpus: async () => [], createRuntime: emptyRuntime })
      .catch(error => error as { code: string; runId: string });
    expect(failure).toHaveProperty('code', 'EVAL_CORPUS_EMPTY');
    emptyDirectory = resolve(resultsRoot, 'tier3/main', (failure as { runId: string }).runId);
    expect(JSON.parse(await readPrivate(resolve(emptyDirectory, 'status.json')))).toHaveProperty('status', 'failed');
    expect(emptyRuntime).not.toHaveBeenCalled();
  } finally {
    console.log = print;
    modelNames.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
    if (directory) await rm(directory, { recursive: true, force: true });
    if (emptyDirectory) await rm(emptyDirectory, { recursive: true, force: true });
    if (priorLatest) await writePrivate(latest, JSON.parse(priorLatest)); else await rm(latest, { force: true });
  }
}, 30_000);

