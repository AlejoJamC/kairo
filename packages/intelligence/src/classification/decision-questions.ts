import { workflowQuestions } from './workflow-contract';
import type { EmailMessage } from './types';
import { z } from 'zod';
import { choiceAnswerSchema } from '../providers/choice-answer-schema';

import { choice, type ChoiceCriteria, type Questions } from '@typesafe-ai/sdk';

import { ModelVerdictSchema, type ModelVerdictResult } from './schema';

const ACTIONABILITY_CRITERIA = {
  needs_action:
    'The sender expects the company to do, decide or answer something — a claim, a request, a question, a pending matter. Also when the company sent the email and something is still open on the other side.',
  fyi: 'Informs, confirms, announces or offers, and expects nothing back. Courtesy lines do not open anything.',
} as const satisfies ChoiceCriteria;

const SUBJECT_MATTER_CRITERIA = {
  service: 'The service the company provides to its customers — a delivery, a fault, the status of a pending matter, an existing account.',
  commercial_demand: 'The sender wants to buy from the company: a prospect asking about the service, an invitation to bid, a request for a quote.',
  commercial_offer: 'The sender wants to sell to the company: a supplier, an agency, an invitation to a commercial event, a third-party promotion.',
  admin: "The company's own running — hiring, compliance, summonses, paperwork, anything its own systems emit.",
} as const satisfies ChoiceCriteria;

const PRIORITY_CRITERIA = {
  P1: 'Loss, breach or blockage has already happened, or the same case has accumulated several unresolved requests.',
  P2: 'Needs handling and affects work, but there is no consummated loss and no chain of unanswered requests.',
  P3: 'Simple, informative or coordination request with no operational impact.',
} as const satisfies ChoiceCriteria;

const CATEGORY_CRITERIA = {
  technical:
    'The delivery of the service itself — not fulfilled, fulfilled poorly, partially or late, or has to be undone. Not about IT: it is whatever the company delivers.',
  billing: 'The matter is money — invoicing, payments, charges, refunds, credit notes.',
  account: 'The matter is access or identity — users, permissions, credentials, profile data.',
  general: 'Informs or coordinates without an incident to resolve.',
  not_applicable: 'Only when the subject makes every other category meaningless — rare.',
} as const satisfies ChoiceCriteria;

const TONE_CRITERIA = {
  aggressive: 'Hostile, threatening or confrontational language — insults, ultimatums, all-caps anger.',
  frustrated:
    'Annoyed or fed up without hostility, decided by insistence, not vocabulary — even when polite: repeated exclamation marks or "this is unacceptable", cited dates, elapsed days or broken commitments, or `threadDepth` of 2 or more.',
  neutral: 'Professional, calm and informative, with none of the frustration signals.',
  positive: 'Friendly, grateful or enthusiastic about something already resolved. Courtesy formulas alone are not positive.',
} as const satisfies ChoiceCriteria;

const URGENCY_CRITERIA = {
  high: 'No slack — something is being lost right now, someone is stuck, or there is an immediate deadline.',
  medium:
    'Needs attention soon, but the event already happened or it can be scheduled. A serious case whose outcome is already settled is usually medium, not high.',
  low: 'No time pressure — planning, inquiry or future coordination.',
} as const satisfies ChoiceCriteria;

export function buildTicketVerdictQuestions(stage?: EmailMessage['stage']): Questions {
  return {
    ...workflowQuestions(stage, 'message'),
    actionability: choice(
      'The company is the owner of `tenantMailbox`. If nobody at the company answers this email, is something left undone?',
      ACTIONABILITY_CRITERIA,
    ),
    subject_matter: choice(
      'What is this email about, in terms of what the company does (`businessContext`; when it is null, decide from the email alone)? A demand and an offer differ only in the direction of the sale: who ends up invoicing whom.',
      SUBJECT_MATTER_CRITERIA,
    ),
    priority: choice(
      'How important is this case for the company, independent of how much time there is to act on it? `threadDepth` counts the earlier messages in the same case.',
      PRIORITY_CRITERIA,
    ),
    category: choice(
      'What is the matter of this email, in terms of what the company delivers (`businessContext`)?',
      CATEGORY_CRITERIA,
    ),
    tone: choice("What is the sender's tone?", TONE_CRITERIA),
    urgency: choice('How much time is there to resolve this, independent of how important the case is?', URGENCY_CRITERIA),
  };
}

export const TICKET_QUESTIONS_VERSION = '1.1.0';
export const DECISION_STATE_VERSION = '1.1.0';

export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

const READOUT_ORDER = ['actionability', 'subject_matter', 'priority', 'category', 'tone', 'urgency'] as const;


export function verdictReadout(answers: Record<string, JevChoiceAnswer>): string {
  return READOUT_ORDER.flatMap((key) => {
    const answer = answers[key];
    return answer ? [`${key}=${answer.choice} (${answer.confidence.toFixed(2)})`] : [];
  }).join(' · ');
}


export function parseTicketVerdictAnswers(answers: Record<string, JevChoiceAnswer>): ModelVerdictResult {
  const confidences = Object.values(answers).map((a) => a.confidence);
  return ModelVerdictSchema.parse({
    actionability: answers['actionability']?.choice,
    subject_matter: answers['subject_matter']?.choice,
    priority: answers['priority']?.choice,
    category: answers['category']?.choice,
    tone: answers['tone']?.choice,
    urgency: answers['urgency']?.choice,
    reasoning: verdictReadout(answers),
    confidence: confidences.length > 0 ? Math.min(...confidences) : 0,
  });
}

export const TicketAnswersSchema = z.object({
  actionability: choiceAnswerSchema(ACTIONABILITY_CRITERIA),
  subject_matter: choiceAnswerSchema(SUBJECT_MATTER_CRITERIA),
  priority: choiceAnswerSchema(PRIORITY_CRITERIA),
  category: choiceAnswerSchema(CATEGORY_CRITERIA),
  tone: choiceAnswerSchema(TONE_CRITERIA),
  urgency: choiceAnswerSchema(URGENCY_CRITERIA),
});
export type TicketAnswers = z.infer<typeof TicketAnswersSchema>;

