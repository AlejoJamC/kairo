// Eval-only vocabulary: annotator-assigned difficulty (KAI-93/KAI-102's
// two-annotator ground-truth sheet). Not part of @kairo/types — this never
// crosses into the product (the LLM pipeline never emits it, nothing persists
// it), it's purely a scoring/analysis concept internal to scripts/eval.
// Single source so compute_metrics.ts and spanish-analysis.ts can't drift
// from each other.
/**
 * How hard the annotators found the email to label. A judgement they make and
 * agree on, not something derived from anything else.
 *
 *   easy       it was straightforward to classify
 *   ambiguous  they are not fully in agreement, or there is doubt
 *   hard       indisputably difficult to label -- passive-aggressive wording,
 *              a request whose real subject is in an attachment, a thread whose
 *              owner cannot be told from the text
 *
 * Ordered least to most difficult, and the single definition of the set: it is
 * both the breakdown's buckets and what the ground truth is validated against.
 */
export const DIFFICULTY_LEVELS = ['easy', 'ambiguous', 'hard'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
