import { computeFieldMetrics } from './metrics';

export interface ToneInflationResult {
  aggressive_or_frustrated_emails: number;
  emails_with_inflated_priority: number;
  tone_inflation_rate: number;
}

export interface DifficultyEntry {
  count: number;
  ticket_type_f1: number;
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
export function computeDifficultyBreakdown(rows: AnalysisRow[]): DifficultyBreakdown {
  const levels = ['easy', 'ambiguous', 'hard'] as const;
  const result = {} as DifficultyBreakdown;

  for (const level of levels) {
    const subset = rows.filter((r) => r.gtDifficulty === level);
    const truths = subset.map((r) => r.gtTicketType);
    const preds = subset.map((r) => r.predictedTicketType);
    const metrics = computeFieldMetrics(truths, preds);
    result[level] = { count: subset.length, ticket_type_f1: metrics.macro_f1 };
  }

  return result;
}
