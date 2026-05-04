import type { TicketType, Tone } from "@kairo/intelligence";

// ---------------------------------------------------------------------------
// Inputs & configuration
// ---------------------------------------------------------------------------

export type PlanTier = "enterprise" | "pro" | "starter" | "none";

export interface ScoreInputs {
  type: TicketType;
  tone: Tone;
  plan: PlanTier;
  receivedAt: string;       // ISO-8601 — used to compute age_score
  recentTicketCount: number; // tickets from same sender in the last 30 days
}

export interface TenantWeights {
  weightType: number;    // default 0.30
  weightPlan: number;    // default 0.35
  weightEmotion: number; // default 0.20
  weightAge: number;     // default 0.15
}

export const DEFAULT_WEIGHTS: TenantWeights = {
  weightType: 0.30,
  weightPlan: 0.35,
  weightEmotion: 0.20,
  weightAge: 0.15,
};

// ---------------------------------------------------------------------------
// Signal value tables (ADR-009)
// ---------------------------------------------------------------------------

const TYPE_SCORE: Record<TicketType, number> = {
  support: 0.8,
  prospect: 0.3,
  internal: 0.2,
  other: 0.2,
  spam: 0.0,
};

const PLAN_SCORE: Record<PlanTier, number> = {
  enterprise: 1.0,
  pro: 0.7,
  starter: 0.4,
  none: 0.0,
};

const EMOTION_SCORE: Record<Tone, number> = {
  aggressive: 1.0,
  frustrated: 0.9,
  neutral: 0.5,
  positive: 0.2,
};

/** Age ceiling in minutes (48 hours). Beyond this the score saturates at 1.0. */
const AGE_CEILING_MINUTES = 2880;

/** Tickets-in-30-days threshold that triggers the recurrence multiplier. */
const RECURRENCE_THRESHOLD = 5;
const RECURRENCE_MULTIPLIER = 1.2;

/** Hard cap: clients with no active plan cannot exceed this score. */
const NO_PLAN_CAP = 0.5;

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

function ageScore(receivedAt: string): number {
  const minutesInQueue = (Date.now() - new Date(receivedAt).getTime()) / 60_000;
  return Math.min(minutesInQueue / AGE_CEILING_MINUTES, 1.0);
}

/**
 * Computes the composite priority score for a ticket.
 * Returns a number in [0.000, 1.000], rounded to 3 decimal places.
 */
export function computePriorityScore(
  inputs: ScoreInputs,
  weights: TenantWeights = DEFAULT_WEIGHTS
): number {
  const typeScore    = TYPE_SCORE[inputs.type] ?? 0;
  const planScore    = PLAN_SCORE[inputs.plan];
  const emotionScore = EMOTION_SCORE[inputs.tone] ?? 0.5;
  const age          = ageScore(inputs.receivedAt);

  const weighted =
    weights.weightType    * typeScore    +
    weights.weightPlan    * planScore    +
    weights.weightEmotion * emotionScore +
    weights.weightAge     * age;

  const multiplier =
    inputs.recentTicketCount >= RECURRENCE_THRESHOLD ? RECURRENCE_MULTIPLIER : 1.0;

  let score = weighted * multiplier;

  // Hard cap: no-plan clients cannot exceed 0.50 regardless of other signals
  if (inputs.plan === "none") {
    score = Math.min(score, NO_PLAN_CAP);
  }

  // Clamp to [0, 1] and round to 3 decimal places
  return Math.round(Math.min(Math.max(score, 0), 1) * 1000) / 1000;
}
