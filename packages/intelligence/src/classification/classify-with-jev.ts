// ---------------------------------------------------------------------------
// KAI-55 — JEV asked the same verdict Anthropic/Ollama already answer.
//
// classifyEmailWithMeta dispatches here when INTELLIGENCE_PROVIDER=jev, and
// the shadow caller runs it alongside another provider's classification.
// The state is assembled from EmailMessage; no derived business decision
// besides the same deriveClassification() every other provider goes through.
//
// Wrapped in withGeneration like classifyEmailWithMeta, not
// classification-audit.ts's telemetry helpers — those are shaped around the
// completion ensemble (ensembleModel, abstain, ...), which has no equivalent
// here yet; JEV's own metadata is enough to trace this call without
// borrowing fields that don't apply to it.
// ---------------------------------------------------------------------------

import type { DecisionProvider, DecisionResult } from '../providers/decision';
import { buildTicketVerdictQuestions, parseTicketVerdictAnswers } from '../providers/jev/ticket-verdict';
import { withGeneration, type LangfuseContext } from '../harness/generation';
import { deriveClassification, provenanceOf, EXTERNAL_FALLBACK_FACTS } from './derive';
import type { ClassificationResult, ModelVerdictResult } from './schema';
import type { EmailMessage } from './types';

export type { DecisionResult, LangfuseContext };

/**
 * The state JEV evaluates: the same fields the text prompt renders
 * (prompt.ts), as structured data instead of prose — JEV has no use for a
 * rendered template, only for the facts it would have rendered from.
 */
function stateFromMessage(message: EmailMessage): Record<string, unknown> {
  return {
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

/**
 * {@link classifyEmailWithMeta}'s counterpart for a `DecisionProvider` — same
 * envelope-derivation, same output shape, different provider shape underneath.
 */
export async function classifyEmailWithJev(
  message: EmailMessage,
  provider: DecisionProvider,
  context?: LangfuseContext,
): Promise<{
  result: ClassificationResult;
  verdict: ModelVerdictResult;
  decision: DecisionResult<ModelVerdictResult>;
}> {
  const state = stateFromMessage(message);
  const { ticketId, accountId } = context ?? {};

  return withGeneration(
    {
      name: 'email-classification-jev',
      model: provider.model,
      input: state,
      metadata: { provider: provider.provider },
      context: { ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) },
    },
    async (generation) => {
      const decision = await provider.decide<ModelVerdictResult>({
        state,
        questions: buildTicketVerdictQuestions(),
      });

      // decision.value carries JEV's raw per-question answers (see
      // ticket-verdict.ts); parseTicketVerdictAnswers turns it into the same
      // ModelVerdictResult Anthropic/Ollama produce via completeJSONWithMeta.
      const verdict = parseTicketVerdictAnswers(
        decision.value as unknown as Parameters<typeof parseTicketVerdictAnswers>[0],
      );

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
