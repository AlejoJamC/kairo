// ---------------------------------------------------------------------------
// KAI-45 F5 — the columns that record what produced a decision.
//
// A stored decision is only auditable if it carries its inputs: the routing
// decision needs the envelope facts and the policy version that read them, and
// a `ticket_type` needs the axes the model answered and the table and rubric
// that turned them into a type. These two helpers are the only place those
// column shapes are built, so the sixteen message writes and the twelve ticket
// writes each gain one spread rather than their own copy of the mapping — the
// same reason classifierEnvelope exists.
//
// Column names match supabase/migrations/20260922201146_persist_classification_audit.sql.
// ---------------------------------------------------------------------------

import { DERIVATION_VERSION, type ModelVerdictResult, type TicketType } from "@kairo/intelligence";

import type { MailFacts } from "./email/mail-facts.js";
import { ROUTING_POLICY_VERSION } from "./email/routing-policy.js";

/** Columns on `messages`: what the envelope said, and which policy read it. */
export function routingAudit(facts: MailFacts): {
  mail_facts: MailFacts;
  routing_policy_version: string;
} {
  return { mail_facts: facts, routing_policy_version: ROUTING_POLICY_VERSION };
}

export interface ClassificationAuditInput {
  verdict: ModelVerdictResult;
  ensemble: { model: string; type: TicketType } | null;
  abstain: boolean;
  promptVersion: string | null;
}

/**
 * Columns on `tickets`: what the model answered, and which table and rubric
 * turned it into the stored type.
 *
 * The ensemble's second answer travels inside `model_verdict` rather than in a
 * column of its own: it is only meaningful next to the first, and `abstain` —
 * the part anyone filters on — already is a column.
 */
export function classificationAudit(input: ClassificationAuditInput): {
  model_verdict: ModelVerdictResult & { ensemble: ClassificationAuditInput["ensemble"] };
  derivation_version: string;
  prompt_version: string | null;
  abstain: boolean;
} {
  return {
    model_verdict: { ...input.verdict, ensemble: input.ensemble },
    derivation_version: DERIVATION_VERSION,
    prompt_version: input.promptVersion,
    abstain: input.abstain,
  };
}

/** What the correction endpoint reads off the ticket and its origin message. */
export interface FeedbackAuditSource {
  ticket: {
    model_verdict: unknown;
    derivation_version: string | null;
    prompt_version: string | null;
  };
  originMessage: {
    mail_facts: unknown;
    routing_policy_version: string | null;
  } | null;
}

/**
 * Columns on `classification_feedback`: what produced the classification a
 * correction was made against, copied at the moment of the correction.
 *
 * Copied rather than joined, the same as the existing `ai_*` columns: the
 * reclassify endpoints overwrite a ticket's classification in place, and a
 * correction must stay attached to the decision it corrected, not to whatever
 * the ticket says later. This is what turns the table from a log of labels into
 * a dataset — every row says which layer produced the answer a person rejected.
 *
 * A ticket classified before these columns existed, or one with no origin
 * message, yields nulls. That is the truth about it, and a guess would poison
 * exactly the dataset this exists to build.
 */
export function feedbackAudit(source: FeedbackAuditSource): {
  ai_model_verdict: unknown;
  ai_derivation_version: string | null;
  ai_prompt_version: string | null;
  ai_mail_facts: unknown;
  ai_routing_policy_version: string | null;
} {
  return {
    ai_model_verdict: source.ticket.model_verdict ?? null,
    ai_derivation_version: source.ticket.derivation_version ?? null,
    ai_prompt_version: source.ticket.prompt_version ?? null,
    ai_mail_facts: source.originMessage?.mail_facts ?? null,
    ai_routing_policy_version: source.originMessage?.routing_policy_version ?? null,
  };
}
