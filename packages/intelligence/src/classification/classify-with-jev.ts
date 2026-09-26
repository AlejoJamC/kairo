// ---------------------------------------------------------------------------
// KAI-55 Fase 1 — JEV asked the same verdict Anthropic/Ollama already answer.
//
// Deliberately not wired into classifyEmail/classifyEmailWithMeta or any
// apps/api call site: KAI-55's own plan (Fase 3, "modo shadow") is where a
// real ticket starts flowing through this, and that needs a comparison
// harness and a storage table this module has no business assuming. This is
// the isolated, callable unit that phase will call — the state a caller
// assembles from EmailMessage, no derived business decision besides the same
// deriveClassification() every other provider already goes through.
// ---------------------------------------------------------------------------

import type { DecisionProvider, DecisionResult } from '../providers/decision';
import { buildTicketVerdictQuestions, parseTicketVerdictAnswers } from '../providers/jev/ticket-verdict';
import { EXTERNAL_FALLBACK_FACTS } from './classify';
import { deriveClassification } from './derive';
import type { ClassificationResult, ModelVerdictResult } from './schema';
import type { EmailMessage } from './types';

export type { DecisionResult };

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
): Promise<{
  result: ClassificationResult;
  verdict: ModelVerdictResult;
  decision: DecisionResult<ModelVerdictResult>;
}> {
  const decision = await provider.decide<ModelVerdictResult>({
    state: stateFromMessage(message),
    questions: buildTicketVerdictQuestions(),
  });

  // decision.value carries JEV's raw per-question answers (see
  // ticket-verdict.ts); parseTicketVerdictAnswers turns it into the same
  // ModelVerdictResult Anthropic/Ollama produce via completeJSONWithMeta.
  const verdict = parseTicketVerdictAnswers(
    decision.value as unknown as Parameters<typeof parseTicketVerdictAnswers>[0],
  );

  const result = deriveClassification(
    message.facts ?? EXTERNAL_FALLBACK_FACTS,
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

  return { result, verdict, decision };
}
