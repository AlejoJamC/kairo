import { expect, test, mock, beforeAll, afterAll } from 'bun:test';
import { sampleCorpus } from './sampling';
import { sampleThreads, createOnboardingRuntime, type OnboardingOverrides } from './onboarding-runtime';
import { syntheticCases, type EvalCase } from './cases';
import { workflowLanguageInstructions } from '../packages/intelligence/src/classification/workflow-contract';

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
  const deps = { classify, work: { analyze, decide, decisionProvider: () => ({ model: 'acme/decision' }) }, knowledge: { candidate: select, extract, validate } } as unknown as OnboardingOverrides;
  return { deps, classify, analyze, decide, select, extract, validate };
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
