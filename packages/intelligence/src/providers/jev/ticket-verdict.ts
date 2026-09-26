// ---------------------------------------------------------------------------
// KAI-55 — the ticket-verdict question set for JEV.
//
// Deliberately reuses ModelVerdictSchema (classification/schema.ts) instead
// of a JEV-specific category/urgency vocabulary: the point of asking JEV this
// is to compare it against Anthropic/Ollama on the exact same axes and feed
// the same deriveClassification() table, not to run a second, incompatible
// classification vocabulary alongside the one @kairo/types already defines
// and Postgres already enforces.
//
// JEV has no free-text primitive, so `reasoning` cannot come from it —
// NO_REASONING says so rather than fabricating an explanation. Confidence is
// one number per question, not one per call, so the call's confidence is the
// minimum across the six answers: a verdict is only as sure as its least sure
// axis, which fits how category_confidence_thresholds (ADR-027) already
// treats confidence as something that must be earned, not averaged up.
// ---------------------------------------------------------------------------

import { choice, type Questions } from '@typesafe-ai/sdk';

import {
  ACTIONABILITY_VALUES,
  SUBJECT_MATTER_VALUES,
  PRIORITY,
  CATEGORY,
  TONE,
  URGENCY,
  ModelVerdictSchema,
  type ModelVerdictResult,
} from '../../classification/schema';

/** `["a", "b"]` -> `{ a: null, b: null }` — a JEV Choice question's criteria, undescribed. */
function criteriaOf<T extends readonly string[]>(values: T): Record<T[number], null> {
  return Object.fromEntries(values.map((v) => [v, null])) as Record<T[number], null>;
}

export function buildTicketVerdictQuestions(): Questions {
  return {
    actionability: choice('Does the sender expect the company to do something?', criteriaOf(ACTIONABILITY_VALUES)),
    subject_matter: choice(
      "What is this message about, in terms of the company's own activity?",
      criteriaOf(SUBJECT_MATTER_VALUES),
    ),
    priority: choice('How urgent is this for the business?', criteriaOf(PRIORITY)),
    category: choice('What department does this concern?', criteriaOf(CATEGORY)),
    tone: choice("What is the sender's tone?", criteriaOf(TONE)),
    urgency: choice('How time-sensitive is this?', criteriaOf(URGENCY)),
  };
}

/** No provider reports a text explanation for a JEV verdict — this says so, honestly. */
export const NO_REASONING = '(JEV: typed decision, no generated reasoning text)';

interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
}

/**
 * `SystemOneResult['answers']` for {@link buildTicketVerdictQuestions}, turned
 * into the same `ModelVerdictResult` Anthropic/Ollama produce.
 *
 * Validated against `ModelVerdictSchema` like every other provider's answer —
 * JEV's Choice criteria constrain the value already, but a mapping mistake
 * here should fail loudly instead of writing an invalid enum downstream.
 */
export function parseTicketVerdictAnswers(answers: Record<string, JevChoiceAnswer>): ModelVerdictResult {
  const confidences = Object.values(answers).map((a) => a.confidence);
  return ModelVerdictSchema.parse({
    actionability: answers['actionability']?.choice,
    subject_matter: answers['subject_matter']?.choice,
    priority: answers['priority']?.choice,
    category: answers['category']?.choice,
    tone: answers['tone']?.choice,
    urgency: answers['urgency']?.choice,
    reasoning: NO_REASONING,
    confidence: confidences.length > 0 ? Math.min(...confidences) : 0,
  });
}
