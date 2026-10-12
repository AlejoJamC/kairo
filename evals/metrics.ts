import { createHash } from 'node:crypto';
import { computeFieldMetrics } from '../scripts/eval/lib/metrics';
import { contracts, type EvalCase } from './cases';
import type { Inference } from './network';

export interface Measurement {
  case: EvalCase;
  status: 'completed' | 'failed';
  prediction: Record<string, string>;
  abstain: boolean | null;
  latencyMs: number;
  requests: Inference[];
  output: unknown;
  calls: unknown[];
  safety: Record<string, boolean>;
}
export interface Review { key: string; ratings: (boolean | null)[]; acceptedImprovement: boolean | null; confirmedSolution: boolean | null; }
export const reviewKey = (row: Measurement) => createHash('sha256').update(JSON.stringify({ case: row.case, output: row.output })).digest('hex');
export function reviewTemplate(rows: Measurement[]): Review[] {
  return rows.filter(row => row.status === 'completed').map(row => ({ key: reviewKey(row), caseId: row.case.id,
    dataset: row.case.dataset, contract: row.case.contract, rubric: row.case.rubric,
    ratings: row.case.rubric.map(() => null), acceptedImprovement: null, confirmedSolution: null }));
}
const ratio = (n: number, d: number) => d ? n / d : null;

export function summarize(rows: Measurement[], reviews: Review[] = []) {
  if (new Set(reviews.map(r => r.key)).size !== reviews.length) throw new Error('Duplicate reviews');
  const template = reviewTemplate(rows);
  for (const review of reviews) {
    const target = template.find(t => t.key === review.key);
    if (!target || review.ratings.length !== target.ratings.length ||
      [...review.ratings, review.acceptedImprovement, review.confirmedSolution].some(v => v !== null && typeof v !== 'boolean')) throw new Error('Invalid or stale review');
  }
  return ['synthetic', 'main', 'coverage'].flatMap(dataset => contracts.map(contract => {
    const group = rows.filter(r => r.case.contract === contract && r.case.dataset === dataset);
    const completed = group.filter(r => r.status === 'completed');
    const reviewed = completed.map(row => reviews.find(r => r.key === reviewKey(row)));
    const expectedFields = [...new Set(group.flatMap(r => Object.keys(r.case.expected)))];
    const fields = Object.fromEntries(expectedFields.map(field => {
      const labeled = group.filter(r => field in r.case.expected);
      return [field, { count: labeled.length, ...computeFieldMetrics(labeled.map(r => r.case.expected[field]!), labeled.map(r => r.status === 'failed' ? '__execution_failed__' : r.prediction[field] ?? '__missing__')) }];
    }));
    const judgments = completed.flatMap(r => Object.entries(r.prediction).filter(([key]) => key.endsWith('_evidence') || ['outcome', 'change', 'contribution'].includes(key)));
    const requests = group.flatMap(r => r.requests);
    const noContribution = completed.filter(r => r.prediction['useful'] === 'false');
    const eligible = group.filter(r => r.case.expected['useful'] === 'true');
    const accepted = reviewed.filter(r => typeof r?.acceptedImprovement === 'boolean');
    const confirmed = reviewed.filter(r => typeof r?.confirmedSolution === 'boolean');
    return { dataset, contract, attempted: group.length, completed: completed.length, failed: group.length - completed.length,
      fields, abstention: ratio(completed.filter(r => r.abstain === true).length, completed.filter(r => r.abstain !== null).length),
      unknownJudgments: ratio(judgments.filter(([, v]) => v === 'unknown').length, judgments.length),
      contradictoryJudgments: judgments.filter(([, v]) => v === 'contradictory').length,
      reviewPending: completed.filter((_, i) => !reviewed[i] || reviewed[i]!.ratings.some(v => v === null)).length,
      rubricFailures: reviewed.flatMap(r => r?.ratings ?? []).filter(v => v === false).length,
      safetyFailures: completed.flatMap(r => Object.values(r.safety)).filter(v => !v).length,
      enrichment: contract !== 'knowledge_impact' ? null : {
        coverage: ratio(eligible.filter(r => r.status === 'completed' && r.prediction['useful'] === 'true').length, eligible.length),
        currentVersionsOnly: ratio(completed.filter(r => r.safety['approvedSourcesOnly']).length, completed.length),
        acceptedImprovements: ratio(accepted.filter(r => r!.acceptedImprovement).length, accepted.length),
        confirmedSolutions: ratio(confirmed.filter(r => r!.confirmedSolution).length, confirmed.length),
        noContribution: noContribution.length,
        noContributionCostUsd: totalCost(noContribution.flatMap(r => r.requests)),
      },
      costUsd: totalCost(requests), requests: requests.length,
      latencyMs: group.length ? group.reduce((sum, r) => sum + r.latencyMs, 0) / group.length : null,
    };
  }));
}

function totalCost(requests: Inference[]) {
  return requests.length && requests.every(r => r.costUsd !== null) ? requests.reduce((sum, r) => sum + r.costUsd!, 0) : null;
}
