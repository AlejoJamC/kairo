// ---------------------------------------------------------------------------
// KAI-55 — closing the loop `ticket_type_auto_approval` (ADR-027) never got.
//
// The table and its gate (`backfillProposalStatus`/`autoApprovedTypes` in
// apps/api/src/functions/pipeline/backfill-proposal-status.ts) are live —
// but nothing has ever written a row, so every account reads back empty and
// backfill (tier2/tier3) never auto-approves anything. The evidence to fix
// that already exists: `ticket_classification_history` records every human
// review action on a classification (confirm, reject, correction). This
// module is the missing middle piece: turn that evidence into the
// precision/sample-count/auto_approval_enabled columns the gate reads.
//
// Confirmed with the user: a recent window (last 50 review actions per
// ticket_type), not the whole history — KAI-55's own text asks for trust
// that reacts faster to recent corrections than it does to old accuracy,
// and an unbounded average cannot do that.
// ---------------------------------------------------------------------------

/** One `ticket_classification_history` row relevant to a human review verdict on `dimension: 'ticket_type'`. */
export interface ClassificationReviewRow {
  actorRef: string;
  toValue: string | null;
  fromValue: string | null;
  applied: boolean;
}

export interface TicketTypeTrustStats {
  ticketType: string;
  /** Null when there is no evidence at all — never a fabricated number. */
  precision: number | null;
  sampleCount: number;
}

/** How many of a ticket_type's most recent review actions to weigh — confirmed with the user. */
export const TRUST_REVIEW_WINDOW = 50;

const CONFIRM_OR_REJECT = 'tickets.classify-approve';
const CORRECTION = 'tickets.correct-classification';

/**
 * Which ticket_type a review row is evidence for, and whether the AI's
 * classification held.
 *
 * A confirm/reject row (`classify-approve`) is a verdict on its `toValue` —
 * the proposal that was confirmed or rejected — and `applied` says which.
 * A correction row is evidence AGAINST its `fromValue`: the type the AI
 * claimed and a human overturned. It says nothing about whether the type it
 * landed on (`toValue`) is itself correct — that is a different ticket's
 * evidence, not this row's.
 */
function evidenceFor(row: ClassificationReviewRow): { ticketType: string; correct: boolean } | null {
  if (row.actorRef === CONFIRM_OR_REJECT) {
    return row.toValue ? { ticketType: row.toValue, correct: row.applied } : null;
  }
  if (row.actorRef === CORRECTION) {
    return row.fromValue ? { ticketType: row.fromValue, correct: false } : null;
  }
  return null;
}

/**
 * Trust stats per `ticket_type`, from one account's review-history rows —
 * already the two relevant `actor_ref`s, `dimension: 'ticket_type'`, ordered
 * most-recent-first. Each type's stats use only that type's own most recent
 * {@link TRUST_REVIEW_WINDOW} pieces of evidence — a type reviewed rarely
 * does not borrow another type's activity to fill its window.
 */
export function computeTrustStatsByType(rowsMostRecentFirst: readonly ClassificationReviewRow[]): TicketTypeTrustStats[] {
  const byType = new Map<string, boolean[]>();
  for (const row of rowsMostRecentFirst) {
    const evidence = evidenceFor(row);
    if (!evidence) continue;
    const bucket = byType.get(evidence.ticketType) ?? [];
    if (bucket.length >= TRUST_REVIEW_WINDOW) continue;
    bucket.push(evidence.correct);
    byType.set(evidence.ticketType, bucket);
  }
  return Array.from(byType.entries(), ([ticketType, outcomes]) => ({
    ticketType,
    sampleCount: outcomes.length,
    precision: outcomes.length > 0 ? outcomes.filter(Boolean).length / outcomes.length : null,
  }));
}

/**
 * Whether a type has earned auto-approval: enough recent samples, at the
 * required precision. False whenever there is no evidence — earned, never
 * assumed.
 */
export function resolveAutoApprovalEnabled(
  stats: Pick<TicketTypeTrustStats, 'precision' | 'sampleCount'>,
  minPrecision: number,
  minSampleSize: number,
): boolean {
  return stats.sampleCount >= minSampleSize && stats.precision !== null && stats.precision >= minPrecision;
}
