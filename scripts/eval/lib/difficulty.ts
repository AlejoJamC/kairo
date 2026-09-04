// Eval-only vocabulary: annotator-assigned difficulty (KAI-93/KAI-102's
// two-annotator ground-truth sheet). Not part of @kairo/types — this never
// crosses into the product (the LLM pipeline never emits it, nothing persists
// it), it's purely a scoring/analysis concept internal to scripts/eval.
// Single source so compute_metrics.ts and spanish-analysis.ts can't drift
// from each other, and ORDER matters here: index is used to rank which of
// two annotators' ratings is "harder" (see compute_metrics.ts's deriveDifficulty).
export const DIFFICULTY_LEVELS = ['easy', 'ambiguous', 'hard'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
