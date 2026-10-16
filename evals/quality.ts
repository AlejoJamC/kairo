import { computeFieldMetrics } from '../scripts/eval/lib/metrics';
import type { Measurement } from './metrics';

export const qualityThresholds = [0.7, 0.8, 0.9] as const;
const fields = ['type', 'priority', 'category', 'tone', 'urgency'] as const;
type ScoredRow = { truth: string; prediction: string; cluster: string };

function fixedLabelF1(rows: ScoredRow[], labels: string[]) {
  return labels.reduce((sum, label) => {
    const tp = rows.filter(row => row.truth === label && row.prediction === label).length;
    const fp = rows.filter(row => row.truth !== label && row.prediction === label).length;
    const fn = rows.filter(row => row.truth === label && row.prediction !== label).length;
    return sum + (2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : 0);
  }, 0) / labels.length;
}

function interval(rows: ScoredRow[]) {
  const grouped = new Map<string, ScoredRow[]>();
  for (const row of rows) grouped.set(row.cluster, [...(grouped.get(row.cluster) ?? []), row]);
  const groups = [...grouped.values()];
  if (groups.length < 2) return null;
  const labels = [...new Set(rows.map(row => row.truth))];
  let seed = 941;
  const samples = Array.from({ length: 2000 }, () => {
    const sample = Array.from({ length: groups.length }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return groups[Math.floor(seed / 0x100000000 * groups.length)]!;
    }).flat();
    return fixedLabelF1(sample, labels);
  }).sort((a, b) => a - b);
  return { level: 0.95, lower: samples[49]!, upper: samples[1949]!,
    method: 'ticket-cluster bootstrap percentile' as const, resamples: samples.length };
}

/** Sampling uncertainty is distinct from a model's uncalibrated self-confidence. */
export function classificationQuality(measurements: Measurement[], clusters: Record<number, string> = {}) {
  return Object.fromEntries(fields.map(field => {
    const rows = measurements.filter(row => field in row.case.expected).map(row => ({
      truth: row.case.expected[field]!,
      prediction: row.status === 'failed' ? '__execution_failed__' : row.prediction[field] ?? '__missing__',
      cluster: clusters[row.case.id] ?? `case-${row.case.id}`,
    }));
    const score = rows.length ? computeFieldMetrics(rows.map(row => row.truth), rows.map(row => row.prediction)).macro_f1 : null;
    const confidenceInterval = interval(rows);
    return [field, { metric: 'macro_f1', score, count: rows.length,
      clusters: new Set(rows.map(row => row.cluster)).size, confidenceInterval,
      comparisons: qualityThresholds.map(threshold => ({ threshold,
        meetsThreshold: score === null ? null : score >= threshold,
        lowerBoundMeetsThreshold: confidenceInterval === null ? null : confidenceInterval.lower >= threshold })),
      calibratedModelConfidence: null }];
  }));
}

export function ticketClusters(tables: Record<string, Record<string, unknown>[]>) {
  return Object.fromEntries((tables['messages'] ?? []).flatMap(message => {
    const position = /^acme-message-(\d+)$/.exec(String(message['external_id']));
    if (!position) return [];
    const ticket = (tables['ticket_messages'] ?? []).find(link => link['message_id'] === message['id'])?.['ticket_id'];
    return ticket ? [[Number(position[1]), String(ticket)]] : [];
  }));
}

export function proposalQuality(steps: { step: string; output?: unknown }[]) {
  const counts = { drafted: 0, invalidSource: 0, redundant: 0, pendingReview: 0, supported: 0, unsupported: 0, uncertain: 0 };
  for (const step of steps.filter(row => row.step === 'knowledge_proposals')) {
    const output = step.output as { proposals?: { status?: string; reasons?: string[]; validation?: { value?: { support?: { choice?: string } } } }[] } | undefined;
    for (const proposal of output?.proposals ?? []) {
      counts.drafted++;
      if (proposal.reasons?.some(reason => ['invalid_source_quote', 'invalid_source_reference'].includes(reason))) counts.invalidSource++;
      if (proposal.reasons?.includes('already_known')) counts.redundant++;
      if (proposal.status === 'pending_review') counts.pendingReview++;
      const support = proposal.validation?.value?.support?.choice;
      if (support === 'supported' || support === 'unsupported' || support === 'uncertain') counts[support]++;
    }
  }
  return counts;
}
