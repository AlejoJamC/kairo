import { computeFieldMetrics, computeBaseline } from './metrics';

export interface ToneInflationResult {
  aggressive_or_frustrated_emails: number;
  emails_with_inflated_priority: number;
  tone_inflation_rate: number;
}

export interface DifficultyEntry {
  count: number;
  ticket_type_f1: number;
  /** Same metric for the majority-class baseline on this subset. */
  ticket_type_baseline_f1: number;
}

export interface DifficultyBreakdown {
  easy: DifficultyEntry;
  ambiguous: DifficultyEntry;
  hard: DifficultyEntry;
}

export interface AnalysisRow {
  gtTone: string;
  gtPriority: string;
  predictedPriority: string;
  gtDifficulty: string;
  gtTicketType: string;
  predictedTicketType: string;
}

// P1 = most urgent (rank 1), P3 = least urgent (rank 3)
const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3 };

/**
 * Tone inflation: pipeline assigns HIGHER priority than warranted
 * when the email tone is aggressive or frustrated.
 * KAI-93 documented bias: urgency derived from tone, not actual business impact.
 */
export function computeToneInflation(rows: AnalysisRow[]): ToneInflationResult {
  const hotTone = rows.filter(
    (r) => r.gtTone === 'aggressive' || r.gtTone === 'frustrated',
  );

  const inflated = hotTone.filter((r) => {
    const gtRank = PRIORITY_RANK[r.gtPriority] ?? 99;
    const predRank = PRIORITY_RANK[r.predictedPriority] ?? 99;
    // Inflated = predicted rank is numerically smaller = higher priority than truth
    return predRank < gtRank;
  });

  const n = hotTone.length;
  return {
    aggressive_or_frustrated_emails: n,
    emails_with_inflated_priority: inflated.length,
    tone_inflation_rate: n === 0 ? 0 : inflated.length / n,
  };
}

/**
 * Difficulty breakdown: ticket_type F1 sliced by annotator-assigned difficulty.
 * The easy→hard gap quantifies the cost of classification ambiguity.
 */
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

export function computeDifficultyBreakdown(rows: AnalysisRow[]): DifficultyBreakdown {
  const levels = DIFFICULTY_LEVELS;
  const result = {} as DifficultyBreakdown;

  for (const level of levels) {
    const subset = rows.filter((r) => r.gtDifficulty === level);
    const truths = subset.map((r) => r.gtTicketType);
    const preds = subset.map((r) => r.predictedTicketType);
    const metrics = computeFieldMetrics(truths, preds);
    result[level] = {
      count: subset.length,
      ticket_type_f1: metrics.macro_f1,
      ticket_type_baseline_f1: computeBaseline(truths).macro_f1,
    };
  }

  return result;
}
