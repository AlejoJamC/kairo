import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import type { EvalCase } from './cases';
import type { OnboardingOverrides } from './onboarding-runtime';
import { onboardingStorage, accountId, userId } from './onboarding-storage';
import { loadHistoricalBaseline, selectHistoricalWindow, type HistoricalBaseline } from './tier2-scenario';
import { createTier2Runtime } from './tier2-runtime';
import { tier2Main } from './tier2';
import { readPrivate, writePrivate } from './private-files';
import { createEvaluationRun, finishEvaluationRun, resultsRoot, type EvaluationRun } from './results';
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
  example(2, '2026-10-14', 'The recovery link worked. Access is restored.', { references: '<root@acme.com>' }),
  example(3, '2026-10-13', 'Acme accepts returns within 14 days.'),
  example(4, '2026-10-11', 'Invented promotional message.', { 'x-spam-status': 'Yes' }),
  example(5, '2026-09-01', 'An older request outside the window.'),
  example(6, '', 'A request without a reliable date.'),
  example(7, '2026-10-10', 'No reusable information is available.'),
  example(8, '2026-10-09', 'Synthetic analysis failure.'),
  example(9, '2026-10-08', 'Synthetic invalid quotation.'),
  example(10, '2026-10-15', 'Acme accepts returns within 14 days.'),
];
function baseline(): HistoricalBaseline {
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
  return { run: '2099-01-01_12-00-00-123Z', tables: storage.tables,
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
      : { evidence: [input.source.split('\n').at(-1)!] }) }] }, model: 'acme/draft', callId: null }));
  const validate = mock(async () => ({ value: [{ novelty: choice('new', ['new', 'redundant', 'unknown']),
    support: choice('supported', ['supported', 'unsupported', 'uncertain']), policy: choice('unknown', ['consistent', 'conflict', 'unknown']) }], model: 'acme/validation', callId: null }));
  return { classify, analyze, decide, candidate, extract, validate,
    deps: { classify, work: { analyze, decide, decisionProvider: () => ({ model: 'acme/decision' }) }, knowledge: { candidate, extract, validate } } as unknown as OnboardingOverrides };
}

test('historical selection uses the application window and virtual corpus clock without resampling onboarding', () => {
  const saved = baseline();
  const selected = selectHistoricalWindow(corpus, saved, 15);
  expect(selected.anchor).toBe('2026-10-15T12:00:00.000Z');
  expect(selected.after).toBe('2026-09-30T00:00:00.000Z');
  expect(selected.cases.map(row => row.id)).toEqual([10, 2, 3, 4, 7, 8, 9]);
  expect(selected.exclusions).toEqual(expect.arrayContaining([
    { case: 1, reason: 'onboarding_processed' }, { case: 5, reason: 'outside_window' }, { case: 6, reason: 'missing_date' },
  ]));
  expect(selectHistoricalWindow(corpus, saved, 1).cases.map(row => row.id)).toEqual([10, 2]);
  expect(() => selectHistoricalWindow(corpus.map(row => ({ ...row, headers: {} })), { ...saved, classified: [] }, 15)).toThrow('EVAL_CORPUS_DATES_MISSING');
  expect(() => selectHistoricalWindow(corpus.map(row => row.id === 1 ? { ...row, body: 'Changed source.' } : row), saved, 15)).toThrow('EVAL_BASELINE_CORPUS_CHANGED');
  expect(() => selectHistoricalWindow(corpus, { ...saved, manifest: { ...saved.manifest, dataset: 'coverage' } }, 15)).toThrow('EVAL_BASELINE_INVALID');
  const incomplete = { ...saved, manifest: { ...saved.manifest, positions: [1, 3], selected: 2 } };
  expect(selectHistoricalWindow(corpus, incomplete, 15).cases.some(row => row.id === 3)).toBe(true);
});

test('the production Tier 2 job preserves onboarding and human decisions while historical services analyze full available threads', async () => {
  const fake = fakes();
  const realDate = globalThis.Date;
  const result = await (await createTier2Runtime(selectHistoricalWindow(corpus, baseline(), 15), baseline(), fake.deps)).execute();
  expect(globalThis.Date).toBe(realDate);
  expect(result.classified.map(item => item.example.id).sort((a, b) => a - b)).toEqual([2, 3, 7, 8, 9, 10]);
  expect(fake.classify).toHaveBeenCalledTimes(6);
  for (const call of fake.classify.mock.calls) expect((call as unknown as [{ stage: string }])[0].stage).toBe('backfill');
  expect(result.tables['tickets']!.find(row => row['id'] === 'acme-ticket')).toMatchObject({ priority: 'P1', ai_reasoning: 'Human-reviewed decision' });
  const related = result.learning.find(item => item.case === 2)!;
  expect(related.ticketId).toBe('acme-ticket');
  expect(fake.analyze.mock.calls.some(([input]) => input.vars.sources.includes(first.body) && input.vars.sources.includes(corpus[1]!.body))).toBe(true);
  expect(result.tables['ticket_classification_history']!.every(row => row['occurred_at'] === '2026-10-15T12:00:00.000Z')).toBe(true);
  expect(result.tables['ticket_proposals']!.every(row => row['status'] === 'pending')).toBe(true);
  expect(result.learning.filter(item => item.status === 'completed')).toHaveLength(5);
  expect(result.learning.find(item => item.case === 8)!.status).toBe('failed');
  expect(result.steps.some(step => step.case === 9 && step.step === 'knowledge_proposals' && JSON.stringify(step.output).includes('invalid_source_reference'))).toBe(true);
  expect(result.tables['operational_learning']!.length).toBeGreaterThan(1);
  expect(Object.values(result.safety).every(Boolean)).toBe(true);
  expect(result.events).toEqual([{ name: 'trigger-tier3', value: { name: 'pipeline/tier3.triggered', data: { userId } } }]);
  expect(result.steps.filter(step => step.step === 'idempotency')).toHaveLength(5);
});

test('the command produces private historical reports and review rubrics without rerunning onboarding or contacting services', async () => {
  const fake = fakes(false);
  const modelNames = ['INTELLIGENCE_PROVIDER', 'TEXT_PROVIDER', 'CLASSIFICATION_MODE', 'INTELLIGENCE_ENSEMBLE',
    'AI_GATEWAY_CLASSIFICATION_MODEL', 'AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL', 'AI_GATEWAY_KNOWLEDGE_DECISION_MODEL', 'AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL', 'AI_GATEWAY_VALIDATION_MODEL'];
  const previous = modelNames.map(name => process.env[name]);
  Object.assign(process.env, { INTELLIGENCE_PROVIDER: 'gateway', TEXT_PROVIDER: 'gateway', CLASSIFICATION_MODE: 'decision',
    AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/classification', AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL: 'acme/evidence',
    AI_GATEWAY_KNOWLEDGE_DECISION_MODEL: 'acme/decision', AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL: 'acme/draft', AI_GATEWAY_VALIDATION_MODEL: 'acme/validation' });
  delete process.env['INTELLIGENCE_ENSEMBLE'];
  const latest = resolve(resultsRoot, 'tier2/main/latest.json');
  const priorLatest = await readPrivate(latest).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  const focusedLatest = resolve(resultsRoot, 'tier2-classification/main/latest.json');
  const priorFocused = await readPrivate(focusedLatest).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  const print = console.log;
  const output: string[] = [];
  console.log = (value: unknown) => { output.push(String(value)); };
  let directory: string | undefined;
  let focusedDirectory: string | undefined;
  try {
    const preview = await tier2Main(['plan', 'main']);
    expect(preview).toMatchObject({ network: false, contract: 'historical_learning', windowDays: 15 });
    expect((preview as { routes: unknown[] }).routes[0]).toMatchObject({ capability: 'language', model: 'acme/evidence' });
    expect(process.env['CLASSIFICATION_MODE']).toBe('decision');
    await expect(tier2Main(['plan', 'main', '50', '../invalid'])).rejects.toHaveProperty('code', 'EVAL_BASELINE_SELECTOR');
    const result = await tier2Main(['execute', 'main'], { loadCorpus: async () => corpus, loadBaseline: async () => baseline(),
      createRuntime: (selection, saved, _overrides, notify, stopped) => createTier2Runtime(selection, saved, fake.deps, notify, stopped) });
    directory = (result as { directory: string }).directory;
    expect(result).toMatchObject({ selected: 7, classified: 6, learningCompleted: 6, failedCases: 0, requests: 0 });
    const manifest = JSON.parse(await readPrivate(resolve(directory, 'manifest.json')));
    const report = JSON.parse(await readPrivate(resolve(directory, 'report.json')));
    const reviews = JSON.parse(await readPrivate(resolve(directory, 'reviews.json')));
    expect(manifest).toMatchObject({ baseline: baseline().run, selected: 7, maximumLogicalCalls: 42 });
    expect(manifest.routes[0]).toMatchObject({ capability: 'language', model: 'acme/evidence' });
    expect(process.env['CLASSIFICATION_MODE']).toBe('decision');
    expect(report).toMatchObject({ requests: 0, failedCases: 0, knowledgeQuality: 'pending human review', infrastructureVerified: false });
    expect(report.quality.classification.type.comparisons.map((row: { threshold: number }) => row.threshold)).toEqual([0.7, 0.8, 0.9]);
    expect(report.quality.proposals.invalidSource).toBe(1);
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((row: { ratings: unknown[] }) => row.ratings.every(value => value === null))).toBe(true);
    expect(output.join(' ')).not.toContain('outside.com');
    expect(output.join(' ')).not.toContain(first.body);
    await expect(tier2Main(['report', 'main', (result as { run: string }).run])).resolves.toHaveProperty('reportUpdated', true);
    const refreshed = JSON.parse(await readPrivate(resolve(directory, 'report.json')));
    expect(refreshed.quality).toEqual(report.quality);
    const focusedPlan = await tier2Main(['plan-classification', 'main']);
    expect(focusedPlan).toMatchObject({ mode: 'tier2-classification', network: false,
      callsPerAdmittedEmail: { classification: 1, evidence: 0, historicalDecision: 0, knowledgeCandidate: 0, maximum: 1 } });
    const focusedFake = fakes(false);
    const focused = await tier2Main(['classify', 'main'], { loadCorpus: async () => corpus, loadBaseline: async () => baseline(),
      createRuntime: (selection, saved, _overrides, notify, stopped) => createTier2Runtime(selection, saved, focusedFake.deps, notify, stopped) });
    focusedDirectory = (focused as { directory: string }).directory;
    expect(focused).toMatchObject({ mode: 'tier2-classification', classified: 6, learningCompleted: 0, pendingProposals: 0, requests: 0 });
    expect(focusedFake.classify).toHaveBeenCalledTimes(6);
    for (const call of [focusedFake.analyze, focusedFake.decide, focusedFake.candidate, focusedFake.extract, focusedFake.validate]) expect(call).not.toHaveBeenCalled();
    expect(JSON.parse(await readPrivate(latest)).run).toBe((result as { run: string }).run);
    const focusedReport = JSON.parse(await readPrivate(resolve(focusedDirectory, 'report.json')));
    expect(focusedReport).toMatchObject({ mode: 'tier2-classification', knowledgeQuality: 'not evaluated' });
    await expect(tier2Main(['report-classification', 'main', (focused as { run: string }).run])).resolves.toHaveProperty('reportUpdated', true);
  } finally {
    console.log = print;
    modelNames.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
    if (directory) await rm(directory, { recursive: true, force: true });
    if (focusedDirectory) await rm(focusedDirectory, { recursive: true, force: true });
    if (priorLatest) await writePrivate(latest, JSON.parse(priorLatest)); else await rm(latest, { force: true });
    if (priorFocused) await writePrivate(focusedLatest, JSON.parse(priorFocused)); else await rm(focusedLatest, { force: true });
  }
}, 30_000);

test('baseline loading rejects an active run and accepts a completed private snapshot with failed learning', async () => {
  const latest = resolve(resultsRoot, 'onboarding/main/latest.json');
  const previous = await readPrivate(latest).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  let saved: EvaluationRun | undefined;
  try {
    saved = await createEvaluationRun('onboarding', 'main', new Date('2099-01-01T12:00:00.123Z'));
    await writePrivate(resolve(saved.directory, 'run.json'), baseline());
    await expect(loadHistoricalBaseline('main', saved.name)).rejects.toThrow('EVAL_BASELINE_RUNNING');
    await finishEvaluationRun(saved, 'failed');
    await expect(loadHistoricalBaseline('main', saved.name)).resolves.toHaveProperty('run', saved.name);
  } finally {
    if (saved) await rm(saved.directory, { recursive: true, force: true });
    if (previous) await writePrivate(latest, JSON.parse(previous)); else await rm(latest, { force: true });
  }
});
