
import type { DecisionProvider, DecisionResult } from '../providers/decision';
import { buildTicketVerdictQuestions, parseTicketVerdictAnswers, TicketAnswersSchema, TICKET_QUESTIONS_VERSION, DECISION_STATE_VERSION, type TicketAnswers } from './decision-questions';
import { withGeneration, type LangfuseContext } from '../harness/generation';
import { deriveClassification, provenanceOf, EXTERNAL_FALLBACK_FACTS, DERIVATION_VERSION } from './derive';
import type { ClassificationResult, ModelVerdictResult } from './schema';
import type { EmailMessage } from './types';
import { ProviderError } from '../providers/base';

export type { DecisionResult, LangfuseContext };


export function stateFromMessage(message: EmailMessage): Record<string, unknown> {
  return {
    stateVersion: DECISION_STATE_VERSION,
    stage: message.stage ?? 'manual',
    evidence: message.evidence ?? { bodySource: 'stored', truncated: false, missing: ['body_provenance'] },
    from: message.from,
    to: message.to ?? null,
    cc: message.cc ?? null,
    subject: message.subject,
    body: message.body,
    threadDepth: message.threadDepth ?? null,
    tenantMailbox: message.tenantMailbox ?? null,
    businessContext: message.businessContext ?? null,
    attachments: message.attachments ?? [],
    facts: message.facts ?? null,
  };
}


export async function classifyEmailWithDecision(
  message: EmailMessage,
  provider: DecisionProvider,
  context?: LangfuseContext,
  signal?: AbortSignal,
): Promise<{
  result: ClassificationResult;
  verdict: ModelVerdictResult;
  decision: DecisionResult<TicketAnswers>;
}> {
  const state = stateFromMessage(message);
  const { ticketId, accountId } = context ?? {};

  return withGeneration(
    {
      name: 'email-classification-decision',
      model: provider.model,
      input: state,
      metadata: { provider: provider.provider, stateVersion: DECISION_STATE_VERSION, questionsVersion: TICKET_QUESTIONS_VERSION, compositionVersion: DERIVATION_VERSION },
      context: { ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) },
    },
    async (generation) => {
      const decision = await provider.decide<TicketAnswers>({
        state,
        questions: buildTicketVerdictQuestions(),
        signal,
      });
      const validated = TicketAnswersSchema.safeParse(decision.value);
      if (!validated.success) throw new ProviderError('Decision classification output does not match its question contract', false);
      decision.value = validated.data;
      const verdict = Object.assign(parseTicketVerdictAnswers(decision.value), {
        decision: {
          answers: decision.value,
          stateVersion: DECISION_STATE_VERSION,
          questionsVersion: TICKET_QUESTIONS_VERSION,
          compositionVersion: DERIVATION_VERSION,
          stage: message.stage ?? 'manual',
          evidence: message.evidence ?? { bodySource: 'stored' as const, truncated: false, missing: ['body_provenance'] },
          typeConfidence: Math.min(decision.value.actionability.confidence, decision.value.subject_matter.confidence),
          reviewReasons: ['provider_not_calibrated', ...(!message.facts ? ['missing_envelope'] : []),
            ...(message.evidence?.truncated ? ['truncated_body'] : [])],
        },
      });

      const facts = message.facts ?? EXTERNAL_FALLBACK_FACTS;
      const result = deriveClassification(
        facts,
        {
          actionability: verdict.actionability,
          subjectMatter: verdict.subject_matter,
          priority: verdict.priority,
          tone: verdict.tone,
          urgency: verdict.urgency,
          reasoning: verdict.reasoning,
        },
        verdict.category,
        verdict.confidence,
      );

      generation.update({
        output: decision.value,
        metadata: {
          provenance: provenanceOf(facts),
          factsPresent: message.facts !== undefined,
          type: result.type,
          modelVersion: decision.modelVersion,
        },
      });

      return { result, verdict, decision };
    },
  );
}

export const classifyEmailWithJev = classifyEmailWithDecision;
