import { expect, test } from 'bun:test';
import { resolveWorkflowEvidence, workflowEvidenceFragments, type WorkflowSource } from './workflow-analysis';

const sources: WorkflowSource[] = [
  { id: 'message', text: 'Account access is blocked.', authority: 'message' },
  { id: 'approved-version', text: 'Use account recovery.', authority: 'approved_knowledge' },
];
const observation = { dimension: 'solution' as const, statement: 'Use recovery for blocked access.', status: 'supported' as const };
const analysis = { missing: [], waitingOn: null, resumeWhen: null };

test('restores exact case and approved version evidence without generated quotations', () => {
  const fragments = workflowEvidenceFragments(sources);
  const result = resolveWorkflowEvidence({ ...analysis, observations: [{ ...observation, evidenceIds: fragments.map(row => row.id) }] }, sources);
  expect(result.observations[0]?.citations).toEqual(sources.map(source => ({ sourceId: source.id, quote: source.text })));
  expect(result.observations[0]?.status).toBe('supported');
});

test('rejects unknown references instead of silently attaching approved knowledge', () => {
  const result = resolveWorkflowEvidence({ ...analysis, observations: [{ ...observation, evidenceIds: ['s1:e1', 'invented'] }] }, sources);
  expect(result.observations).toEqual([]);
  expect(result.missing).toContain('unsupported_solution');
});

test('message-only evidence remains reported and does not acquire a knowledge citation', () => {
  const result = resolveWorkflowEvidence({ ...analysis, observations: [{ ...observation, evidenceIds: ['s1:e1'] }] }, sources);
  expect(result.observations[0]?.status).toBe('reported');
  expect(result.observations[0]?.citations).toEqual([{ sourceId: 'message', quote: sources[0]!.text }]);
});
