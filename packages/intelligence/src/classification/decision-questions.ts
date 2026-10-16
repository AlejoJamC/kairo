import { workflowQuestions } from './workflow-contract';
import { MESSAGE_PRIORITY_CRITERIA, HISTORICAL_URGENCY_CRITERIA, HISTORICAL_ATTENTION_VERSION } from './historical-attention';
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

const PRIORITY_CRITERIA = MESSAGE_PRIORITY_CRITERIA;

const CATEGORY_CRITERIA = {
  technical:
    'The delivery of the service itself — not fulfilled, fulfilled poorly, partially or late, or has to be undone. Not about IT: it is whatever the company delivers.',
  billing: 'The matter is money — invoicing, payments, charges, refunds, credit notes.',
  account: 'The matter is access or identity — users, permissions, credentials, profile data.',
  general: 'Informs or coordinates without an incident to resolve.',
  not_applicable: 'Only when the subject makes every other category meaningless — rare.',
} as const satisfies ChoiceCriteria;

const TONE_CRITERIA = {
  aggressive: 'Hostile, threatening or confrontational language — insults, explicit threats, all-caps anger.',
  frustrated:
    'The current sender shows dissatisfaction or pressure about how the company handled something, even in polite wording: complains about or escalates a failure, passes on their own customer\'s complaint, insists on a response or a claim already raised (citing earlier emails, dates or time waited), states the harm it is causing, or sets a deadline or consequence for the company. Thread depth and RE:/Fwd: prefixes alone are not frustration.',
  neutral:
    'Informative or procedural: reports or documents a fact, files a claim with its data, shares data, lists or attachments, asks for a concrete step, confirms or coordinates — with no frustration signal and no warmth beyond greeting and sign-off. Asking for something urgently is urgency, not tone.',
  positive:
    'A cordial, cooperative or appreciative register in a message with no complaint or pending problem with the company: introducing themselves or seeking a relationship or opportunity, a routine request made kindly and with thanks, accepting or confirming that something was done, or apologizing and committing to improve. A courtesy formula closing a message about a problem does not qualify.',
} as const satisfies ChoiceCriteria;

const URGENCY_CRITERIA = {
  high: 'At the time of this message there is no slack: an ongoing loss, a person or operation still blocked, an immediate deadline, or a consequence that worsens while waiting. An incident that started in the past but remains blocking belongs here, even when described politely or in past tense. A loss, damage or shortage that already happened stays here while the affected party is still without the goods, service or compensation and has no confirmed solution; it is settled only once replaced, paid or closed.',
  medium:
    'Needs attention soon, but the remaining action can be scheduled without an ongoing blockage, growing loss or immediate deadline — for example scheduling a pickup or appointment, sending or requesting documents, or confirming a step of a case whose solution is already under way. A past event qualifies only if its consequences are settled or no longer time-critical; past tense alone is not evidence of that.',
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
      'How important is what this message brings to the company, independent of how much time there is to act on it? Judge this message itself: earlier messages and reminders in the thread do not raise it by themselves.',
      PRIORITY_CRITERIA,
    ),
    category: choice(
      'What is the matter of this email, in terms of what the company delivers (`businessContext`)?',
      CATEGORY_CRITERIA,
    ),
    tone: choice("What stance does the sender of the current message take toward the company, as written in `subject` and `body`? Judge what this sender writes, not how serious the matter is, the thread position or the tone of quoted messages.", TONE_CRITERIA),
    urgency: choice('How quickly must someone act at the time this message was written, given `subject` and `body`? Judge consequences of waiting and whether the problem is still active, independently of priority and tone. Do not use today as the clock for historical messages. A keyword flag is not an urgency judgment; absence of an English keyword does not mean absence of urgency.', stage === 'backfill' ? HISTORICAL_URGENCY_CRITERIA : URGENCY_CRITERIA),
  };
}

export const TICKET_QUESTIONS_VERSION = '1.1.3';
export const DECISION_STATE_VERSION = '1.1.0';
export function ticketQuestionsVersion(stage?: EmailMessage['stage']) {
  return stage === 'backfill' ? `${TICKET_QUESTIONS_VERSION}:historical-attention:${HISTORICAL_ATTENTION_VERSION}` : TICKET_QUESTIONS_VERSION;
}

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

