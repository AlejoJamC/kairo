// ---------------------------------------------------------------------------
// KAI-55 — is a resolved ticket worth turning into knowledge?
//
// A native decision model answers four typed questions; it never writes the article. A person
// validates every draft before it is published, so `requiresHumanValidation`
// is not a field: it is always true.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { choiceAnswerSchema } from '../providers/choice-answer-schema';
import { choice, type ChoiceCriteria, type Questions } from '@typesafe-ai/sdk';

export const KNOWLEDGE_TYPES = [
  'resolution',
  'diagnostic_pattern',
  'routing_rule',
  'policy',
  'exception',
  'evaluation_example',
  'none',
] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export const EVIDENCE_QUALITIES = ['low', 'medium', 'high'] as const;
export type EvidenceQuality = (typeof EVIDENCE_QUALITIES)[number];

export const KnowledgeDecisionSchema = z.object({
  isKnowledgeCandidate: z.boolean(),
  knowledgeType: z.enum(KNOWLEDGE_TYPES),
  reusableAcrossCustomers: z.boolean(),
  evidenceQuality: z.enum(EVIDENCE_QUALITIES),
  /** The least sure of the four answers: a decision is only as sure as its weakest axis. */
  confidence: z.number().min(0).max(1),
  audit: z.object({
    answers: z.record(z.string(), z.object({ type: z.literal('choice'), choice: z.string(), confidence: z.number(),
      probabilities: z.record(z.string(), z.number()) })),
    stateVersion: z.string(), questionsVersion: z.string(), reviewReasons: z.array(z.string()),
  }).optional(),
});
export type KnowledgeDecision = z.infer<typeof KnowledgeDecisionSchema>;

const YES_NO = (yes: string, no: string) => ({ yes, no }) as const satisfies ChoiceCriteria;

const CANDIDATE_CRITERIA = YES_NO(
  'The thread contains a resolution, diagnosis, rule or exception that someone facing the same situation later could reuse.',
  'Routine exchange, a one-off, an unresolved case, or nothing beyond what any agent already knows.',
);

const TYPE_CRITERIA = {
  resolution: 'A concrete fix or answer to a problem, with the steps that solved it.',
  diagnostic_pattern: 'How to recognise the cause of a problem from its symptoms.',
  routing_rule: 'Who should own this kind of case, or where it should go.',
  policy: 'A rule of the company that the thread states or applies.',
  exception: 'A case that departs from the usual rule, and why.',
  evaluation_example: 'A clear example of a hard or ambiguous case worth keeping to test the classifier.',
  none: 'Nothing in the thread is worth keeping.',
} as const satisfies ChoiceCriteria;

const REUSABLE_CRITERIA = YES_NO(
  'Applies to other customers, not only the one in this thread.',
  'Specific to this customer, contract or moment.',
);

const EVIDENCE_CRITERIA = {
  low: 'The outcome is implied or unconfirmed; the thread does not show that the answer worked.',
  medium: 'The answer is stated but the thread does not show the customer confirming it.',
  high: 'The answer is stated and the thread shows the case closed by it.',
} as const satisfies ChoiceCriteria;

export function buildKnowledgeQuestions(): Questions {
  return {
    is_candidate: choice('Does this resolved thread contain something worth keeping as knowledge?', CANDIDATE_CRITERIA),
    knowledge_type: choice('What kind of knowledge is it?', TYPE_CRITERIA),
    reusable: choice('Would it help with other customers\' tickets?', REUSABLE_CRITERIA),
    evidence: choice('How well does the thread show the answer worked?', EVIDENCE_CRITERIA),
  };
}

export const KNOWLEDGE_QUESTIONS_VERSION = '1.0.0';
export const KnowledgeAnswersSchema = z.object({
  is_candidate: choiceAnswerSchema(CANDIDATE_CRITERIA),
  knowledge_type: choiceAnswerSchema(TYPE_CRITERIA),
  reusable: choiceAnswerSchema(REUSABLE_CRITERIA),
  evidence: choiceAnswerSchema(EVIDENCE_CRITERIA),
});
export type KnowledgeAnswers = z.infer<typeof KnowledgeAnswersSchema>;

interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export function parseKnowledgeAnswers(answers: Record<string, ChoiceAnswer>): KnowledgeDecision {
  const confidences = Object.values(answers).map((a) => a.confidence);
  return KnowledgeDecisionSchema.parse({
    isKnowledgeCandidate: answers['is_candidate']?.choice === 'yes',
    knowledgeType: answers['knowledge_type']?.choice,
    reusableAcrossCustomers: answers['reusable']?.choice === 'yes',
    evidenceQuality: answers['evidence']?.choice,
    confidence: confidences.length > 0 ? Math.min(...confidences) : 0,
  });
}

/** Evidence gates drafting; a probability threshold requires explicit calibration. */
export function shouldDraftKnowledge(
  decision: KnowledgeDecision,
  threshold?: number,
): boolean {
  return (
    decision.isKnowledgeCandidate &&
    decision.knowledgeType !== 'none' &&
    decision.evidenceQuality !== 'low' &&
    (threshold === undefined || decision.confidence >= threshold)
  );
}

export const KnowledgeDraftSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});
export type KnowledgeDraft = z.infer<typeof KnowledgeDraftSchema>;
