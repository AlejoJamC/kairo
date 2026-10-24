import type { SemanticFailure, SourceReference, VectorSpace } from './service';

export type IndexCoverageState = 'ready' | 'missing' | 'stale' | 'incompatible' | 'unknown';
export type CoverageBasis = 'authorized_references' | 'known_requests';
export interface IndexInspection {
  source: SourceReference;
  state: IndexCoverageState;
  reason?: SemanticFailure;
}
export interface CoverageCounts {
  denominator: number | null;
  ready: number;
  missing: number;
  stale: number;
  incompatible: number;
  unknown: number | null;
  ratio: number | null;
}
export interface CoverageReport extends CoverageCounts {
  status: 'ok' | 'partial' | 'unavailable';
  reason?: SemanticFailure;
  basis: CoverageBasis | 'unknown';
  requested: number | null;
  space: VectorSpace;
  sources: Array<CoverageCounts & { source: string }>;
}

/** Counts only explicit selections; no inventory is inferred from stored rows. */
export function summarizeCoverage(input: {
  inspections?: readonly IndexInspection[];
  requested?: number;
  basis?: CoverageBasis;
  space: VectorSpace;
  sourceLabel: (kind: string) => string;
}): CoverageReport {
  const counts = (): CoverageCounts => ({ denominator: 0, ready: 0, missing: 0, stale: 0, incompatible: 0, unknown: 0, ratio: null });
  if (!input.inspections) return {
    ...counts(), denominator: null, unknown: null, status: 'unavailable', basis: 'unknown', requested: null,
    space: { ...input.space }, sources: [],
  };
  const total = counts();
  const sources = new Map<string, CoverageCounts & { source: string }>();
  const unique = new Map(input.inspections.map(item => [JSON.stringify([item.source.kind, item.source.id]), item]));
  for (const inspection of unique.values()) {
    const label = input.sourceLabel(inspection.source.kind);
    if (!sources.has(label)) sources.set(label, { ...counts(), source: label });
    const group = sources.get(label)!;
    for (const bucket of [total, group]) {
      bucket.denominator!++;
      bucket[inspection.state]!++;
      bucket.ratio = bucket.unknown ? null : bucket.denominator ? bucket.ready / bucket.denominator : null;
    }
  }
  const reasons = new Set([...unique.values()].map(item => item.reason).filter((reason): reason is SemanticFailure => reason !== undefined));
  const reason = total.denominator && total.unknown === total.denominator && reasons.size === 1 ? [...reasons][0] : undefined;
  return { ...total, status: total.unknown ? total.unknown === total.denominator ? 'unavailable' : 'partial' : 'ok',
    ...(reason ? { reason } : {}), basis: input.basis ?? 'authorized_references',
    requested: input.requested ?? input.inspections.length, space: { ...input.space }, sources: [...sources.values()] };
}
