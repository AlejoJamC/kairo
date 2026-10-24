import { expect, mock, test } from 'bun:test';
import { scoreRetrieval, summarizeRetrieval, compareRetrieval, retrievalRecommendation, type RankedObservation } from './retrieval-metrics';
import { retrievalCases, retrievalDocuments } from './retrieval-cases';
import { retrievalMain } from './retrieval';

const row = (returned: string[], change: Partial<RankedObservation> = {}): RankedObservation => ({
  judgment: { id: 'acme-query', cluster: 'acme-cluster', eligible: ['primary','secondary','distractor'], grades: { primary: 2, secondary: 1, distractor: 0 } },
  returned, status: 'ok', latencyMs: 10, limit: 3, ...change,
});

test('retrieval metrics distinguish precision, recall, reciprocal rank and graded ranking', () => {
  expect(scoreRetrieval(row(['primary','secondary']))).toMatchObject({ precision: 1, recall: 1, reciprocalRank: 1, ndcg: 1 });
  const ranked = scoreRetrieval(row(['distractor','secondary','primary']));
  expect(ranked.precision).toBeCloseTo(2/3);
  expect(ranked.recall).toBe(1);
  expect(ranked.reciprocalRank).toBe(0.5);
  expect(ranked.ndcg).toBeCloseTo((1/Math.log2(3)+3/Math.log2(4))/(3+1/Math.log2(3)));
});

test('a short result list does not shrink the ideal ranking denominator', () => {
  const result = scoreRetrieval(row(['primary'], { limit: 2 }));
  expect(result.precision).toBe(1);
  expect(result.recall).toBe(0.5);
  expect(result.ndcg).toBeCloseTo(3/(3+1/Math.log2(3)));
  expect(scoreRetrieval(row([], { limit: 2 }))).toMatchObject({ precision: null, recall: 0, reciprocalRank: 0, ndcg: 0 });
});

test('no-answer controls score abstention without inventing recall or a perfect ranking', () => {
  const judgment = { id: 'acme-no-answer', cluster: 'none', eligible: ['distractor'], grades: { distractor: 0 } };
  expect(scoreRetrieval(row([], { judgment }))).toMatchObject({ noAnswerCorrect: 1, precision: null, recall: null, ndcg: null });
  expect(scoreRetrieval(row(['distractor'], { judgment }))).toMatchObject({ noAnswerCorrect: 0, precision: 0 });
});

test('unjudged documents remain unknown rather than being labeled irrelevant by the search output', () => {
  const judgment = { id: 'acme-partial', cluster: 'partial', eligible: ['primary','unjudged'], grades: { primary: 2 } };
  expect(scoreRetrieval(row(['primary'], { judgment }))).toMatchObject({ labelCoverage: 0.5, precision: 1, recall: null, ndcg: null });
  expect(scoreRetrieval(row(['unjudged'], { judgment }))).toMatchObject({ returnedLabelCoverage: 0, precision: null, recall: null });
});

test('technical unavailability and partial results do not become semantic false negatives or valid empty answers', () => {
  for (const status of ['partial','unavailable'] as const) {
    expect(scoreRetrieval(row([], { status }))).toMatchObject({ precision: null, recall: null, ndcg: null, noAnswerCorrect: null });
    const summary = summarizeRetrieval([row([], { status })],215);
    expect(summary.available).toBe(0); expect(summary.successfulEmpty).toBe(0);
    expect(summary.metrics.recall.count).toBe(0);
  }
});

test('invalid judgments and duplicate or over-limit results are rejected', () => {
  for (const invalid of [row(['primary','primary']), row(['primary','secondary'],{ limit: 1 }),
    row([], { limit: 0 }), row([], { judgment: { ...row([]).judgment, grades: { primary: 3 } } })]) {
    expect(() => scoreRetrieval(invalid)).toThrow();
  }
});

test('uncertainty resamples independent query clusters reproducibly and reports missing support', () => {
  expect(summarizeRetrieval([row(['primary']),row([])],215).metrics.recall.interval).toBeNull();
  const rows = [row(['primary']),row([], { judgment: { ...row([]).judgment, id: 'acme-second', cluster: 'other' } })];
  const summary = summarizeRetrieval(rows,215);
  expect(summary.metrics.recall.interval).toEqual(summarizeRetrieval(rows,215).metrics.recall.interval);
  expect(summary.metrics.recall.interval).toMatchObject({ level: 0.95, resamples: 2000, lower: 0, upper: 0.5 });
  expect(summary.metrics.recall.clusters).toBe(2);
});

test('profile deltas pair the same queries and never compare changed judgments', () => {
  const baseline = [row(['distractor','primary'])], candidate = [row(['primary','secondary'])];
  expect(compareRetrieval(baseline,candidate,215)['recall']).toMatchObject({ pairedQueries: 1, delta: 0.5, interval: null });
  expect(compareRetrieval(baseline,[row([], { status: 'unavailable' })],215)['recall']).toMatchObject({ pairedQueries: 0, delta: null });
  expect(() => compareRetrieval(baseline,[row([], { judgment: { ...row([]).judgment, grades: {} } })],215)).toThrow('judgments differ');
  expect(() => compareRetrieval([...baseline,...baseline],candidate,215)).toThrow('Duplicate');
});

test('recommendations retain production profiles and require complete labels and mandatory guarantees', () => {
  const summaries = [summarizeRetrieval([row(['primary'])],215)];
  expect(retrievalRecommendation({ summaries, synthetic: true, safetyPassed: true })).toMatchObject({ action: 'retain_current_profiles', automaticChanges: false,
    evidenceUsable: true, reason: 'synthetic_evidence_does_not_establish_business_relevance' });
  expect(retrievalRecommendation({ summaries, synthetic: true, safetyPassed: false }).evidenceUsable).toBe(false);
  expect(retrievalRecommendation({ summaries: [], synthetic: true, safetyPassed: true }).evidenceUsable).toBe(false);
  expect(retrievalRecommendation({ summaries: [summarizeRetrieval([row([], { status: 'unavailable' })],215)], synthetic: true, safetyPassed: true }).evidenceUsable).toBe(false);
});

test('synthetic judgments are exhaustive, independent and include hard positives and no-answer controls', () => {
  const cases = retrievalCases(), before = JSON.stringify(cases);
  expect(cases).toHaveLength(8);
  expect(cases.filter(row => Object.values(row.judgment.grades).every(grade => grade === 0))).toHaveLength(2);
  expect(cases.every(row => Object.keys(row.judgment.grades).length === retrievalDocuments.length)).toBe(true);
  expect(cases.filter(row => row.judgment.id.includes('hard'))).toHaveLength(3);
  scoreRetrieval({ judgment: cases[0]!.judgment, returned: [], status: 'ok', latencyMs: 0, limit: 3 });
  expect(JSON.stringify(cases)).toBe(before);
});

test('the retrieval plan performs no network or inference and rejects unsupported datasets', async () => {
  const original = globalThis.fetch, denied = mock(async () => { throw new Error('Unexpected network'); });
  globalThis.fetch = denied as unknown as typeof fetch;
  try {
    expect(await retrievalMain(['plan','synthetic'])).toMatchObject({ network: false, inference: false, queries: 16 });
    expect(denied).not.toHaveBeenCalled();
    await expect(retrievalMain(['execute','main'])).rejects.toThrow('Use retrieval.ts');
  } finally { globalThis.fetch = original; }
});
