import { expect, test } from 'bun:test';
import { summarizeSmoke, type SmokeMeasurement } from './gateway-smoke-metrics';

test('keeps stages and models separate and exposes consequential misses and unknown costs', () => {
  const base: SmokeMeasurement = { stage: 'onboarding', capability: 'decision', model: 'acme/decision',
    latencyMs: 20, costUsd: null, truth: { actionability: 'needs_action', priority: 'P1', urgency: 'high' },
    prediction: { actionability: 'fyi', priority: 'P3', urgency: 'low' }, abstain: true,
    consequential: true, incompleteEvidence: false };
  const cells = summarizeSmoke([base, { ...base, stage: 'backfill', costUsd: 0, prediction: base.truth },
    { ...base, stage: 'new_email', model: 'acme/text', capability: 'language', abstain: false, incompleteEvidence: true }]);
  expect(cells).toHaveLength(3);
  expect(cells[0]!.consequentialErrors).toBe(1);
  expect(cells[0]!.costUsd).toBeNull();
  expect(cells[0]!.classificationCoverage).toBe(0);
  expect(cells[1]!.costUsd).toBe(0);
  expect(cells[1]!.dimensions['priority']!.macro_f1).toBe(1);
  expect(cells[2]!.incompleteEvidenceWithoutAbstention).toBe(1);
  expect(cells.every((cell) => cell.automationThreshold === null)).toBe(true);
});
