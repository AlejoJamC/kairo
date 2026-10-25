import { expect, test } from 'bun:test';
import { approvedSourceCases, evaluateApprovedSources, knownSourceMetrics } from './approved-source-retrieval';
import type { MemoryProposal } from './enrichment-memory';

const proposal = (id: number, position: number, content: string): MemoryProposal => ({
  id, sourcePosition: position, title: 'Acme procedure', content, sourceText: 'Invented source', evidence: [], reviewReasons: [],
  decision: 'pending_review', reviewer: '', targetPositions: [],
});
const approved = (row: MemoryProposal): MemoryProposal => ({ ...row, decision: 'approved', reviewer: 'Acme reviewer' });

test('known positive references come from human approval and source identity, never retrieval output', () => {
  const original = [proposal(1,1,'Use account recovery.'),proposal(2,1,'Request a new expired link.'),proposal(3,2,'Download an invoice.')];
  const review = [approved(original[0]!),approved(original[1]!),{ ...original[2]!,decision: 'rejected' as const }];
  const before = JSON.stringify({ original,review });
  const input = approvedSourceCases(original,review,[{ id: 1,subject: 'Access',body: 'I cannot sign in.' },{ id: 2,subject: 'Billing',body: 'I need an invoice.' }]);
  expect(input.documents).toHaveLength(2);
  expect(input.cases).toEqual([{ position: 1,query: 'Access\n\nI cannot sign in.',truncated: false,
    expected: ['acme-approved-version-1','acme-approved-version-2'] }]);
  expect(JSON.stringify({ original,review })).toBe(before);
});

test('altered approvals, missing sources and absent approval evidence fail before inference', () => {
  const original = [proposal(1,1,'Use account recovery.')];
  for (const review of [[{ ...approved(original[0]!),content: 'Changed claim' }],
    [{ ...approved(original[0]!),title: 'Changed title' }], [{ ...approved(original[0]!),reviewer: '' }], original]) {
    expect(() => approvedSourceCases(original,review,[{ id: 1,subject: 'Access',body: 'Invented body' }])).toThrow();
  }
  expect(() => approvedSourceCases(original,[approved(original[0]!)],[{ id: 2,subject: 'Access',body: 'Invented body' }])).toThrow();
});

test('query truncation is explicit and never removes its known positive label', () => {
  const original = [proposal(1,1,'Use account recovery.')];
  const input = approvedSourceCases(original,original.map(approved),[{ id: 1,subject: 'Access',body: 'x'.repeat(3000) }]);
  expect(input.cases[0]!.query).toHaveLength(2000);
  expect(input.cases[0]).toMatchObject({ truncated: true,expected: ['acme-approved-version-1'] });
});

test('source recovery measures known links while leaving precision and negative judgments unknown', () => {
  const metrics = knownSourceMetrics([{ position: 1,expected: ['known-a','known-b'],returned: ['unjudged','known-b'],status: 'ok' }]);
  expect(metrics).toMatchObject({ knownSourceRecall: 0.5,sourceHitRate: 1,fullyRecoveredQueries: 0,
    meanKnownSourceReciprocalRank: 0.5,precision: null,noAnswerAccuracy: null,allKnownSourcesRecovered: false,unjudgedResultsAreNegative: false });
  expect(knownSourceMetrics([{ position: 1,expected: ['known-a'],returned: [],status: 'unavailable' }]))
    .toMatchObject({ knownSourceRecall: null,sourceHitRate: null,allKnownSourcesRecovered: false });
  expect(knownSourceMetrics([])).toMatchObject({ allKnownSourcesRecovered: false,knownSourceRecall: null });
});

test('the independent eval runs public indexing and retrieval with the existing memory adapter', async () => {
  const original = [proposal(1,1,'Recover access.'),proposal(2,2,'Download invoice.')];
  const input = approvedSourceCases(original,original.map(approved),[
    { id: 1,subject: 'Recover access',body: 'Recover access.' },{ id: 2,subject: 'Invoice',body: 'Download invoice.' },
  ]);
  const result = await evaluateApprovedSources(input,async text => /invoice/i.test(text) ? [0,1] : [1,0],
    { provider: 'synthetic',model: 'acme-test',dimensions: 2 });
  expect(result.executionPassed).toBe(true);
  expect(result.quality).toMatchObject({ status: 'not_approved',baselineAllKnownSourcesRecovered: true });
  expect(result.coverage).toMatchObject({ ready: 2,ratio: 1 });
  expect(result.technicalChecks).toMatchObject({ passed: true,identityQueries: 2,recoveredIdentities: 2 });
  expect(result.comparisons[0]!.metrics).toMatchObject({ allKnownSourcesRecovered: true,knownSourceRecall: 1,meanKnownSourceReciprocalRank: 1 });
  expect(result.boundaries.persistenceAndSearch).toContain('Supabase RPCs and SQL ranking are not exercised');
});

test('completed measurement never approves a profile with missing known sources', async () => {
  const original = [proposal(1,1,'Recover access.')];
  const input = approvedSourceCases(original,original.map(approved),[{ id: 1,subject: 'query-only',body: 'Invented request.' }]);
  const result = await evaluateApprovedSources(input,async text => text.includes('query-only') ? [0,1] : [1,0],
    { provider: 'synthetic',model: 'acme-test',dimensions: 2 });
  expect(result.executionPassed).toBe(true);
  expect(result.quality).toMatchObject({ status: 'not_approved',baselineAllKnownSourcesRecovered: false });
  expect(result.technicalChecks.passed).toBe(true);
  expect(result.comparisons[0]!.metrics.knownSourceRecall).toBe(0);
  expect(result.comparisons[2]!.metrics.knownSourceRecall).toBe(1);
  expect(result.comparisons.find(row => row.profile.name === 'minimum_threshold_same_limit'))
    .toMatchObject({ profile: { threshold: -1,limit: 12 },metrics: { knownSourceRecall: 1 } });
});

test('inconsistent embeddings fail the identity check independently of relevance', async () => {
  const original = [proposal(1,1,'Recover access.')];
  const input = approvedSourceCases(original,original.map(approved),[{ id: 1,subject: 'query-only',body: 'Invented request.' }]);
  let calls = 0;
  const result = await evaluateApprovedSources(input,async () => ++calls === 1 ? [1,0] : [0,1],
    { provider: 'synthetic',model: 'acme-test',dimensions: 2 });
  expect(result.technicalChecks).toMatchObject({ passed: false,identityQueries: 1,recoveredIdentities: 0 });
  expect(result.executionPassed).toBe(false);
});

test('unavailable query embeddings fail execution even when indexed identity checks pass', async () => {
  const original = [proposal(1,1,'Recover access.')];
  const input = approvedSourceCases(original,original.map(approved),[{ id: 1,subject: 'query-only',body: 'Invented request.' }]);
  const result = await evaluateApprovedSources(input,async text => {
    if (text.includes('query-only')) throw new Error('Provider unavailable');
    return [1,0];
  },{ provider: 'synthetic',model: 'acme-test',dimensions: 2 });
  expect(result.technicalChecks.passed).toBe(true);
  expect(result.executionPassed).toBe(false);
  expect(result.comparisons.every(row => row.metrics.available === 0)).toBe(true);
  expect(result.quality.status).toBe('not_approved');
});
