// KAI-55 — the vocabulary for what Kairo learns from operating a client's
// support, as opposed to `kb_articles` (external, client-owned documentation
// used to answer tickets — a different domain; conflating the two was an
// earlier mistake on this ticket).
//
// Two lanes feed this, with different trust on the way in:
//
//   - `human_correction`: a person corrected or confirmed something. The
//     correction IS the approval — there is no separate review step.
//   - `system_derived`: Kairo inferred a pattern on its own, with nobody
//     correcting anything directly. It cannot be trusted on arrival and
//     starts as `pending_review`.
//
// Always scoped to one account. Cross-account sharing is a real future case
// but has no defined strategy or labeling yet, so nothing here assumes one —
// adding it later means adding to this vocabulary, not reworking it.

export const LEARNING_ORIGINS = ['human_correction', 'system_derived'] as const;
export type LearningOrigin = (typeof LEARNING_ORIGINS)[number];

export const LEARNING_STATUSES = ['approved', 'pending_review', 'rejected'] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

// From KAI-55's original sketch — this part of it had no existing production
// vocabulary to conflict with, unlike ticket classification.
export const OPERATIONAL_LEARNING_TYPES = [
  'resolution',
  'diagnostic_pattern',
  'routing_rule',
  'policy',
  'exception',
  'evaluation_example',
] as const;
export type OperationalLearningType = (typeof OPERATIONAL_LEARNING_TYPES)[number];

export interface OperationalLearning {
  accountId: string;
  origin: LearningOrigin;
  status: LearningStatus;
  learningType: OperationalLearningType;
  /** What was learned, in words — the thing a reviewer approves or rejects. */
  summary: string;
  /** Traceable back to what produced it — a candidate with no evidence approves nothing. */
  evidence: {
    ticketIds: string[];
    sourceCount: number;
  };
  /** Null for `human_correction`: the person's action is the trust signal, not a score. */
  confidence: number | null;
  reviewedBy?: string;
  reviewedAt?: string;
}
