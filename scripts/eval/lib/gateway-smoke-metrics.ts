import { computeFieldMetrics } from './metrics';

export interface SmokeMeasurement {
  stage: string; capability: string; model: string; latencyMs: number; costUsd: number | null;
  truth: Record<string, string>; prediction: Record<string, string>;
  abstain: boolean; consequential: boolean; incompleteEvidence: boolean;
}

/** Aggregate each model and stage separately; never fit an automation threshold. */
export function summarizeSmoke(measurements: SmokeMeasurement[]) {
  const cells = new Map<string, SmokeMeasurement[]>();
  for (const row of measurements) {
    const key = JSON.stringify([row.stage, row.capability, row.model]);
    cells.set(key, [...(cells.get(key) ?? []), row]);
  }
  return [...cells.values()].map((rows) => {
    const first = rows[0]!;
    const consequential = rows.filter((row) => row.consequential);
    const knownCosts = rows.flatMap((row) => row.costUsd === null ? [] : [row.costUsd]);
    const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
    return {
      stage: first.stage, capability: first.capability, model: first.model, count: rows.length,
      dimensions: Object.fromEntries(Object.keys(first.truth).map((field) => [field,
        computeFieldMetrics(rows.map((row) => row.truth[field]!), rows.map((row) => row.prediction[field]!))])),
      consequentialErrors: consequential.filter((row) => row.prediction['actionability'] !== 'needs_action'
        || row.prediction['priority'] !== 'P1' || row.prediction['urgency'] !== 'high').length,
      consequentialCases: consequential.length,
      incompleteEvidenceWithoutAbstention: rows.filter((row) => row.incompleteEvidence && !row.abstain).length,
      abstentionRate: rows.filter((row) => row.abstain).length / rows.length,
      classificationCoverage: rows.filter((row) => !row.abstain).length / rows.length,
      latencyMs: { p50: latencies[Math.ceil(rows.length * .5) - 1], p95: latencies[Math.ceil(rows.length * .95) - 1] },
      costUsd: knownCosts.length === rows.length ? knownCosts.reduce((sum, cost) => sum + cost, 0) : null,
      costSource: 'gateway', providerBilledCostUsd: null,
      knownCostUsd: knownCosts.reduce((sum, cost) => sum + cost, 0), missingCostCount: rows.length - knownCosts.length,
      automationThreshold: null,
    };
  });
}
