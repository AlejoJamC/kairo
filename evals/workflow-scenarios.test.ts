import { expect, test } from 'bun:test';
import { corpusScenarios, parseWorkflowMemory, workflowControls } from './workflow-scenarios';
import { syntheticCases, type EvalCase } from './cases';
import { workflowStorage } from './workflow-storage';

test('each workflow has independent controls, with no corpus knowledge borrowed from another workflow', () => {
  for (const mode of ['incoming', 'enrichment', 'reply'] as const) {
    const scenarios = workflowControls(mode);
    expect(new Set(scenarios.map(row => row.id)).size).toBe(scenarios.length);
    expect(scenarios.every(row => row.dataset === 'synthetic')).toBe(true);
    expect(new Set(scenarios.map(row => row.contract)).size).toBe(1);
  }
});

test('corpus conversations contain only explicitly linked earlier sources, retaining original bodies', () => {
  const base = { ...syntheticCases[0]!, dataset: 'main' as const };
  const corpus: EvalCase[] = [
    { ...base, id: 1, body: 'Earlier request.', headers: { date: '2026-01-01', 'message-id': '<one@acme.com>' } },
    { ...base, id: 2, body: 'Current update.', headers: { date: '2026-01-02', 'message-id': '<two@acme.com>', 'in-reply-to': '<one@acme.com>' } },
    { ...base, id: 3, body: 'Later update.', headers: { date: '2026-01-03', 'in-reply-to': '<two@acme.com>' } },
    { ...base, id: 4, body: 'Same subject, separate case.', headers: { date: '2026-01-01' } },
  ];
  const before = JSON.stringify(corpus);
  const rows = corpusScenarios('incoming', corpus);
  expect(rows[0]!.messages).toEqual([{ direction: 'inbound', body: 'Earlier request.' }]);
  expect(rows[1]!.messages).toEqual([{ direction: 'inbound', body: 'Earlier request.' }, { direction: 'inbound', body: 'Current update.' }]);
  expect(rows[3]!.messages).toHaveLength(1);
  expect(rows.every(row => Object.keys(row.expected).length === 0)).toBe(true);
  expect(rows.every(row => row.knowledge === undefined)).toBe(true);
  expect(JSON.stringify(corpus)).toBe(before);
  const saved = workflowStorage(rows[1]!);
  expect(saved.tables['messages']!.map(item => item['received_at'])).toEqual(['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z']);
  expect(saved.ticket).toMatchObject({ priority: null, model_verdict: {} });
  const undated = corpusScenarios('reply', corpus.map(row => ({ ...row, headers: {} })));
  expect(undated.every(row => row.messages?.length === 1)).toBe(true);
});

test('private memory is scoped by corpus position and rejects invalid or duplicated entries', () => {
  const corpus = [{ ...syntheticCases[0]!, dataset: 'main' as const }];
  const memory = parseWorkflowMemory({ cases: [{ position: 1, knowledge: [{ status: 'approved', content: 'Use account recovery.' }] }] });
  expect(corpusScenarios('enrichment', corpus, memory)[0]!.knowledge).toEqual(memory.cases[0]!.knowledge);
  const many = corpusScenarios('enrichment', corpus, { cases: [{ position: 1, knowledge: [
    { status: 'pending_review', content: 'Unapproved claim.' }, ...memory.cases[0]!.knowledge,
  ] }] });
  expect(many.map(row => row.targetKnowledge)).toEqual([0, 1]);
  expect(() => parseWorkflowMemory({ cases: [{ position: 1, knowledge: [{ status: 'published', content: 'x' }] }] })).toThrow('EVAL_WORKFLOW_MEMORY');
  expect(() => corpusScenarios('reply', corpus, { cases: [...memory.cases, ...memory.cases] })).toThrow('EVAL_WORKFLOW_MEMORY');
  expect(() => corpusScenarios('incoming', [])).toThrow('EVAL_CORPUS_EMPTY');
});

test('approval fixtures enforce every allowed member role and membership status', async () => {
  const input = workflowControls('enrichment')[0]!;
  for (const role of ['owner', 'admin', 'supervisor', 'agent']) {
    for (const status of ['active', 'invited', 'suspended']) {
      const storage = workflowStorage(input);
      storage.tables['account_members']![0]!['role'] = role;
      storage.tables['account_members']![0]!['status'] = status;
      const response = await storage.db.rpc('review_workflow_knowledge', { p_version_id: 'acme-version-0', p_decision: 'approved' });
      expect(response.error === null).toBe(status === 'active');
      expect(storage.current().length).toBe(status === 'active' ? 1 : 0);
    }
  }
});

test('current knowledge excludes approved old revisions after replacement or withdrawal', () => {
  const storage = workflowStorage({ ...workflowControls('reply')[0]!, approve: false });
  expect(storage.current()).toHaveLength(1);
  storage.tables['knowledge_versions']!.push({ ...storage.tables['knowledge_versions']![0]!, id: 'acme-withdrawn', revision: 2, status: 'withdrawn' });
  expect(storage.current()).toHaveLength(0);
});
