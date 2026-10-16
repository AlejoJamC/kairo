import { expect, test, mock, beforeAll, afterAll } from 'bun:test';
import { sampleCorpus } from './sampling';
import { sampleThreads, createOnboardingRuntime, type OnboardingOverrides } from './onboarding-runtime';
import { syntheticCases, type EvalCase } from './cases';
import { workflowLanguageInstructions } from '../packages/intelligence/src/classification/workflow-contract';
import { onboardingMain, synthesisReport } from './onboarding';
import { privateRoot, readPrivate, writePrivate } from './private-files';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { findEvaluationRun, resultsRoot } from './results';
import { enqueueOnboardingLearning } from '../apps/api/src/lib/onboarding-learning';
import { onboardingStorage, accountId } from './onboarding-storage';

const originalFetch = globalThis.fetch;
const denied = mock(async () => { throw new Error('Network forbidden in technical tests'); });
beforeAll(() => { globalThis.fetch = denied as unknown as typeof fetch; });
afterAll(() => { globalThis.fetch = originalFetch; expect(denied).not.toHaveBeenCalled(); });

const example: EvalCase = { ...syntheticCases[0]!, body: 'Acme accepts returns within 14 days.', headers: {}, id: 1 };
function answer(choice: string, options: string[]) {
  return { type: 'choice' as const, choice, confidence: 1, probabilities: Object.fromEntries(options.map(value => [value, Number(value === choice)])) };
}
function overrides(candidate = true, validQuote = true) {
  const classify = mock(async () => ({ result: { type: 'support', priority: 'P2', urgency: 'medium', category: 'account', tone: 'neutral', reasoning: 'Needs review', confidence: 0.8 },
    verdict: { priority: 'P2', urgency: 'medium', category: 'account', tone: 'neutral' },
    abstain: true, ensemble: null, promptVersion: '1.0.0', meta: { model: 'acme/classifier' }, prompt: 'Synthetic prompt' }));
  const analyze = mock(async () => ({ data: { observations: [], missing: ['confirmed_outcome'], waitingOn: null, resumeWhen: null },
    model: 'acme/evidence', promptVersion: '1.0.0', llmCallId: null }));
  const questions = JSON.parse(workflowLanguageInstructions('backfill')) as Record<string, { criteria: Record<string, string> }>;
  const decide = mock(async () => ({ data: { value: Object.fromEntries(Object.entries(questions).map(([key, question]) =>
    [key, answer('unknown', Object.keys(question.criteria))])), modelVersion: 'acme/decision' }, llmCallId: null }));
  const select = mock(async () => ({ value: { candidate: answer(candidate ? 'yes' : 'no', ['yes', 'no']) }, model: 'acme/decision', callId: null }));
  const extract = mock(async () => ({ value: { proposals: [{ kind: 'business_fact', title: 'Returns period',
    content: 'Proposed returns period: 14 days.', evidence: [validQuote ? example.body : 'Returns within 90 days.'] }] }, model: 'acme/draft', callId: null }));
  const validate = mock(async () => ({ value: [{ novelty: answer('new', ['new', 'redundant', 'unknown']),
    support: answer('supported', ['supported', 'unsupported', 'uncertain']), policy: answer('unknown', ['consistent', 'conflict', 'unknown']) }], model: 'acme/validation', callId: null }));
  const synthesize = mock(async () => ({ output: { profile: null, themes: [], missing: ['business_profile'] }, model: 'acme/draft', promptVersion: '1.0.0' }));
  const deps = { classify, work: { analyze, decide, decisionProvider: () => ({ model: 'acme/decision' }) }, knowledge: { candidate: select, extract, validate },
    synthesis: { runAgent: synthesize } } as unknown as OnboardingOverrides;
  return { deps, classify, analyze, decide, select, extract, validate, synthesize };
}

test('sampling uses the configured count without replacement and can replay the same draw', () => {
  const corpus = Array.from({ length: 50 }, (_, i) => i + 1);
  const sample = sampleCorpus(corpus, 30, 'acme-seed');
  expect(sample.cases).toHaveLength(30);
  expect(new Set(sample.cases).size).toBe(30);
  expect(sample.cases).toEqual(sampleCorpus(corpus, 30, sample.seed).cases);
  expect(sample.cases).not.toEqual(sampleCorpus(corpus, 30, 'another-seed').cases);
  expect(sampleCorpus(corpus, 7).cases).toHaveLength(7);
  expect(sampleCorpus(corpus.slice(0, 5), 30).cases).toHaveLength(5);
  expect(corpus[0]).toBe(1);
});

test('thread reconstruction uses references instead of similar subjects', () => {
  const cases = [example, { ...example, id: 2 }, { ...example, id: 3, headers: { 'message-id': '<root@acme.com>' } },
    { ...example, id: 4, headers: { references: '<root@acme.com>' } }];
  const threads = sampleThreads(cases);
  expect(threads.get(1)).not.toBe(threads.get(2));
  expect(threads.get(3)).toBe(threads.get(4));
});

test('the same saved sample flows from tickets to grounded pending knowledge and persisted work records', async () => {
  const fake = overrides();
  const runtime = await createOnboardingRuntime([example, { ...example, id: 2 }], fake.deps);
  const result = await runtime.execute();
  expect(result.steps.filter(step => step.status === 'failed')).toEqual([]);
  expect(result.tables['tickets']).toHaveLength(2);
  expect(result.tables['ticket_messages']).toHaveLength(2);
  expect(result.tables['ticket_state_history']).toHaveLength(2);
  expect(result.tables['ticket_decision_history']).toHaveLength(2);
  expect(result.tables['operational_learning']).toHaveLength(2);
  expect(result.tables['operational_learning']![0]).toMatchObject({ status: 'pending_review', learning_type: 'business_fact' });
  expect(Object.values(result.safety).every(Boolean)).toBe(true);
  expect(result.steps.findIndex(step => step.step === 'first_delivery' && step.case === 2))
    .toBeLessThan(result.steps.findIndex(step => step.step === 'sample_learning'));
  expect(result.tables['ticket_proposals']!.every(row => row['status'] === 'pending')).toBe(true);
  expect(fake.classify).toHaveBeenCalledTimes(2);
  expect(fake.analyze).toHaveBeenCalledTimes(2);
  expect(fake.decide).toHaveBeenCalledTimes(2);
  expect(fake.extract).toHaveBeenCalledTimes(2);
  expect(fake.validate).toHaveBeenCalledTimes(2);
});

test('the synthesis reads the saved tier 1 tickets and leaves at most five proposals for the owner', async () => {
  const fake = overrides(false);
  fake.synthesize.mockImplementation((async (_contract: unknown, request: { tools: { name: string; execute: (input: unknown) => Promise<{ data: Record<string, unknown> }> }[] }) => {
    const listed = await request.tools.find(tool => tool.name === 'list_account_tickets')!.execute({ tier: 1 });
    const ids = (listed.data['tickets'] as { id: string }[]).map(ticket => ticket.id);
    return { output: { profile: { summary: 'Acme handles returns for its customers.', evidenceTicketIds: [ids[0]!] },
      themes: [{ name: 'Returns', description: 'Return requests.', ticketIds: ids }, { name: 'Unsupported', description: 'Invented evidence.', ticketIds: ['acme-invented', 'acme-other'] }],
      missing: [] }, model: 'acme/draft', promptVersion: '1.0.0' };
  }) as never);
  const result = await (await createOnboardingRuntime([example, { ...example, id: 2 }], fake.deps)).execute();
  expect(result.steps).toContainEqual(expect.objectContaining({ step: 'business_synthesis', status: 'completed' }));
  expect(result.synthesis).toEqual({ profile: true, themes: 1, droppedThemes: 1, missing: [] });
  expect(synthesisReport(result.tables)).toEqual({ profile: true, themes: 1, reviewItems: 2, themeCoverage: 1 });
  expect(result.tables['operational_learning']!.every(row => row['status'] === 'pending_review')).toBe(true);
  expect(Object.values(result.safety).every(Boolean)).toBe(true);
});

test('non-candidates stop before drafting; fabricated quotations stop before semantic validation', async () => {
  for (const [candidate, quote] of [[false, true], [true, false]]) {
    const fake = overrides(candidate, quote);
    const result = await (await createOnboardingRuntime([example], fake.deps)).execute();
    expect(result.steps.filter(step => step.status === 'failed')).toEqual([]);
    expect(result.tables['operational_learning']).toHaveLength(0);
    expect(fake.extract).toHaveBeenCalledTimes(candidate ? 1 : 0);
    expect(fake.validate).not.toHaveBeenCalled();
    expect(result.tables['tickets']).toHaveLength(1);
  }
});

test('learning failure preserves first delivery and is visible as a failed step', async () => {
  const fake = overrides();
  fake.analyze.mockImplementation(async () => { throw new Error('Synthetic evidence failure'); });
  const result = await (await createOnboardingRuntime([example], fake.deps)).execute();
  expect(result.tables['tickets']).toHaveLength(1);
  expect(result.steps).toContainEqual(expect.objectContaining({ step: 'sample_learning', status: 'failed' }));
  expect(result.tables['ticket_decision_history']).toHaveLength(0);
  expect(fake.extract).not.toHaveBeenCalled();
});

test('server-marked spam is saved without calling classification or learning', async () => {
  const fake = overrides();
  const result = await (await createOnboardingRuntime([{ ...example, headers: { 'x-spam-status': 'Yes' } }], fake.deps)).execute();
  expect(result.tables['messages']).toHaveLength(1);
  expect(result.tables['tickets']).toHaveLength(0);
  expect(fake.classify).not.toHaveBeenCalled();
  expect(fake.analyze).not.toHaveBeenCalled();
});

test('sample queue accepts only linked inbound sources of the account and does not duplicate work', async () => {
  const { db, tables, writes } = onboardingStorage('en');
  tables['tickets']!.push({ id: 'acme-ticket', account_id: accountId });
  tables['messages']!.push(
    { id: 'acme-valid', account_id: accountId, direction: 'inbound', processing_tier: 1 },
    { id: 'acme-outbound', account_id: accountId, direction: 'outbound', processing_tier: 1 },
    { id: 'acme-historical', account_id: accountId, direction: 'inbound', processing_tier: 2 },
    { id: 'acme-unlinked', account_id: accountId, direction: 'inbound', processing_tier: 1 },
    { id: 'acme-other-account', account_id: 'acme-other', direction: 'inbound', processing_tier: 1 },
  );
  for (const messageId of ['acme-valid', 'acme-outbound', 'acme-historical', 'acme-other-account']) tables['ticket_messages']!.push({ ticket_id: 'acme-ticket', message_id: messageId });
  const sources = tables['messages']!.map(row => ({ ticketId: 'acme-ticket', messageId: String(row['id']) }));
  expect(await enqueueOnboardingLearning(accountId, sources, db)).toEqual({ eligibleSources: 1 });
  expect(tables['decision_work_items']).toHaveLength(1);
  expect(tables['decision_work_items']![0]).toMatchObject({ contract: 'historical_learning', dedupe_key: 'message:acme-valid' });
  const count = writes.length;
  await enqueueOnboardingLearning(accountId, sources, db);
  expect(writes).toHaveLength(count);
});

test('private outputs permit evaluation modes and still reject writes to corpus inputs', async () => {
  const id = randomUUID();
  try {
    for (const directory of ['classification', 'onboarding']) {
      const file = resolve(resultsRoot, directory, 'synthetic', id, 'synthetic.json');
      await writePrivate(file, { invented: true });
      expect(JSON.parse(await readPrivate(file))).toEqual({ invented: true });
    }
    await expect(writePrivate(resolve(privateRoot, 'input', id, 'synthetic.json'), {})).rejects.toThrow('Evaluation output path required');
    await expect(writePrivate(resolve(privateRoot, 'output', 'unapproved', id, 'synthetic.json'), {})).rejects.toThrow('Evaluation output path required');
  } finally {
    for (const directory of ['classification', 'onboarding']) await rm(resolve(resultsRoot, directory, 'synthetic', id), { recursive: true, force: true });
  }
});

test('the execute command saves a complete sampled run through the actual queue writer without network', async () => {
  const names = ['INTELLIGENCE_PROVIDER', 'TEXT_PROVIDER', 'CLASSIFICATION_MODE', 'INTELLIGENCE_ENSEMBLE',
    'AI_GATEWAY_CLASSIFICATION_MODEL', 'AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL', 'AI_GATEWAY_KNOWLEDGE_DECISION_MODEL',
    'AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL', 'AI_GATEWAY_VALIDATION_MODEL'] as const;
  const previous = names.map(name => process.env[name]);
  Object.assign(process.env, { INTELLIGENCE_PROVIDER: 'gateway', TEXT_PROVIDER: 'gateway', CLASSIFICATION_MODE: 'language',
    AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/classification', AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL: 'acme/evidence',
    AI_GATEWAY_KNOWLEDGE_DECISION_MODEL: 'acme/decision', AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL: 'acme/draft', AI_GATEWAY_VALIDATION_MODEL: 'acme/validation' });
  delete process.env['INTELLIGENCE_ENSEMBLE'];
  const print = console.log;
  console.log = () => {};
  const fake = overrides();
  let run: string | undefined;
  let directory: string | undefined;
  const latestFile = resolve(resultsRoot, 'onboarding/main/latest.json');
  const previousLatest = await readPrivate(latestFile).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  try {
    const result = await onboardingMain(['execute', 'main'], {
      loadCorpus: async () => Array.from({ length: 50 }, (_, i) => ({ ...example, id: i + 1, dataset: 'main' as const })),
      createRuntime: (cases, _overrides, notify, stopped) => createOnboardingRuntime(cases, fake.deps, notify, stopped),
    });
    expect(result).toHaveProperty('run');
    run = (result as { run: string }).run;
    const dir = (result as { directory: string }).directory;
    directory = dir;
    const manifest = JSON.parse(await readPrivate(resolve(dir, 'manifest.json')));
    const report = JSON.parse(await readPrivate(resolve(dir, 'report.json')));
    const saved = JSON.parse(await readPrivate(resolve(dir, 'run.json')));
    expect(manifest.selected).toBe(Math.min(manifest.sampleSize, 50));
    expect(new Set(manifest.positions).size).toBe(manifest.selected);
    expect(report).toMatchObject({ failedSteps: 0, requests: 0, learningCompleted: manifest.selected });
    expect(saved.tables.decision_work_items).toHaveLength(manifest.selected);
    expect(saved.tables.operational_learning).toHaveLength(manifest.selected);
    expect(fake.analyze).toHaveBeenCalledTimes(manifest.selected);
    await expect(onboardingMain(['report', 'main', run])).resolves.toEqual({ run, directory: dir, reportUpdated: true });
    expect(await findEvaluationRun('onboarding', 'main')).toEqual({ name: run, directory: dir });
  } finally {
    console.log = print;
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
    if (directory) await rm(directory, { recursive: true, force: true });
    if (previousLatest) await writePrivate(latestFile, JSON.parse(previousLatest));
    else await rm(latestFile, { force: true });
  }
}, 30_000);
