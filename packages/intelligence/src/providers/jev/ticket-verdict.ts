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
// Same axes is not the same question unless the criteria carry the same
// rubric: the text prompt (prompts/email-classification/en.md) gives
// Anthropic/Ollama a paragraph of decision rules per label — an undescribed
// `{P1: null, P2: null, P3: null}` gives JEV the label and nothing else,
// which is not a fair comparison of the model, only of how much the label
// name alone happens to convey. Each criterion below is that same rubric,
// condensed to what a Choice description needs (TypeSafe's own guidance:
// "Score levels must describe concrete situations and stand on their own").
// Keep the two in sync when the prompt's rubric changes.
//
// JEV has no free-text primitive, so `reasoning` cannot come from it —
// NO_REASONING says so rather than fabricating an explanation. Confidence is
// one number per question, not one per call, so the call's confidence is the
// minimum across the six answers: a verdict is only as sure as its least sure
// axis, which fits how category_confidence_thresholds (ADR-027) already
// treats confidence as something that must be earned, not averaged up.
// ---------------------------------------------------------------------------

import { choice, type ChoiceCriteria, type Questions } from '@typesafe-ai/sdk';

import { ModelVerdictSchema, type ModelVerdictResult } from '../../classification/schema';

const ACTIONABILITY_CRITERIA = {
  needs_action: 'The sender expects the company to do, decide or answer something — a claim, a request, a pending matter.',
  fyi: 'Informs, confirms, announces or offers, and expects nothing back.',
} as const satisfies ChoiceCriteria;

const SUBJECT_MATTER_CRITERIA = {
  service: 'The service the company provides to its customers — a delivery, a fault, an existing account issue.',
  commercial_demand: 'The sender wants to buy from the company: an inquiry, a request for a quote, a lead.',
  commercial_offer: 'The sender wants to sell to the company: a supplier, an agency, a third-party promotion.',
  admin: "The company's own running — hiring, compliance, paperwork, records its own systems emit.",
} as const satisfies ChoiceCriteria;

const PRIORITY_CRITERIA = {
  P1: 'Loss, breach or blockage has already happened, or the same case has accumulated several unresolved requests.',
  P2: 'Needs handling and affects work, but there is no consummated loss and no chain of unanswered requests.',
  P3: 'Simple, informative or coordination request with no operational impact.',
} as const satisfies ChoiceCriteria;

const CATEGORY_CRITERIA = {
  technical: 'The delivery of the service itself was not fulfilled, was fulfilled poorly or partially, or arrived late.',
  billing: 'The matter is money — invoicing, payments, charges, refunds, credit notes.',
  account: 'The matter is access or identity — users, permissions, credentials, profile data.',
  general: 'Informs or coordinates without an incident to resolve.',
  not_applicable: 'Only when the subject makes every other category meaningless — rare.',
} as const satisfies ChoiceCriteria;

const TONE_CRITERIA = {
  aggressive: 'Hostile, threatening or confrontational language.',
  frustrated:
    'Annoyed from insistence, even when the wording stays polite: repeated urgency language, cited dates or attempt counts, or two or more prior messages in the same thread.',
  neutral: 'Professional, calm and informative, with none of the frustration signals.',
  positive: 'Friendly, grateful or enthusiastic about something already resolved.',
} as const satisfies ChoiceCriteria;

const URGENCY_CRITERIA = {
  high: 'No slack — something is being lost right now, someone is stuck, or there is an immediate deadline.',
  medium:
    'Needs attention soon, but the event already happened or it can be scheduled. A serious case whose outcome is already settled is usually medium, not high.',
  low: 'No time pressure — planning, inquiry or future coordination.',
} as const satisfies ChoiceCriteria;

export function buildTicketVerdictQuestions(): Questions {
  return {
    actionability: choice('Does the sender expect the company to do something?', ACTIONABILITY_CRITERIA),
    subject_matter: choice(
      "What is this message about, in terms of the company's own activity? What separates a demand from an offer is the direction of the sale: who ends up invoicing whom.",
      SUBJECT_MATTER_CRITERIA,
    ),
    // Ranks how important the case is — not how much time there is to act;
    // that is `urgency`, asked separately below. A case can be P1 and medium
    // at once.
    priority: choice(
      'How important is this case for the business, independent of how much time there is to act on it?',
      PRIORITY_CRITERIA,
    ),
    category: choice('What department does this concern?', CATEGORY_CRITERIA),
    tone: choice("What is the sender's tone?", TONE_CRITERIA),
    // Measures how much time there is to resolve — not how important the
    // case is; that is `priority`, asked separately above.
    urgency: choice('How much time is there to resolve this, independent of how important the case is?', URGENCY_CRITERIA),
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
