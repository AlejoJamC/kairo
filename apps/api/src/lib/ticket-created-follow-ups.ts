import type { SupabaseClient } from "@supabase/supabase-js";
import { getFlag } from "@kairo/feature-flags";
import { detectEscalationTriggers, type EmailMessage } from "@kairo/intelligence";
import { triggerContactExtraction } from "./contact-extraction-trigger.js";
import { requestSemanticIndexing } from "./semantic-indexing.js";
import { runJevShadowClassification } from "./jev-shadow-classification.js";
import { maybeSendTicketAcknowledgement } from "./ticket-acknowledgement.js";
import { isFreshForAutoReply, maybeSendOutOfHoursReply } from "./out-of-hours-reply.js";
import { getFreshGmailToken } from "./gmail-token.js";

/** Every flow that creates tickets. A new flow is added here first. */
export const TICKET_CREATION_FLOWS = [
  "tier1",
  "incremental-sync",
  "tier2",
  "tier3",
  "classification-retry-sweep",
  "gmail-poll",
] as const;
export type TicketCreationFlow = (typeof TICKET_CREATION_FLOWS)[number];

export const TICKET_FOLLOW_UPS = [
  "contact-extraction",
  "semantic-index",
  "shadow-classification",
  "escalation-detection",
  "acknowledgement",
  "out-of-hours-reply",
] as const;
export type TicketFollowUp = (typeof TICKET_FOLLOW_UPS)[number];

/** `true` runs the activity for that flow; `{ skip }` states why it does not. */
export type FollowUpDecision = true | { skip: string };

const NOT_LIVE_MAIL = { skip: "the flow does not ingest live inbound mail, so it never replies to the customer" } as const;

/**
 * The single place that says which activity runs in which flow. Every cell is
 * explicit, so a flow cannot silently miss an activity: the type forces a
 * decision and a skipped cell carries its reason.
 */
export const FOLLOW_UP_APPLICABILITY: Record<TicketFollowUp, Record<TicketCreationFlow, FollowUpDecision>> = {
  "contact-extraction": { tier1: true, "incremental-sync": true, tier2: true, tier3: true, "classification-retry-sweep": true, "gmail-poll": true },
  "semantic-index": { tier1: true, "incremental-sync": true, tier2: true, tier3: true, "classification-retry-sweep": true, "gmail-poll": true },
  "shadow-classification": { tier1: true, "incremental-sync": true, tier2: true, tier3: true, "classification-retry-sweep": true, "gmail-poll": true },
  "escalation-detection": { tier1: true, "incremental-sync": true, tier2: true, tier3: true, "classification-retry-sweep": true, "gmail-poll": true },
  acknowledgement: { tier1: true, "incremental-sync": true, tier2: true, tier3: true, "classification-retry-sweep": true, "gmail-poll": true },
  "out-of-hours-reply": { tier1: true, "incremental-sync": true, tier2: NOT_LIVE_MAIL, tier3: NOT_LIVE_MAIL, "classification-retry-sweep": NOT_LIVE_MAIL, "gmail-poll": true },
};

/** One row per activity with its decision for every flow, for display and tests. */
export function describeTicketFollowUps(): { followUp: TicketFollowUp; flows: Record<TicketCreationFlow, FollowUpDecision> }[] {
  return TICKET_FOLLOW_UPS.map((followUp) => ({ followUp, flows: FOLLOW_UP_APPLICABILITY[followUp] }));
}

const applies = (followUp: TicketFollowUp, flow: TicketCreationFlow): boolean =>
  FOLLOW_UP_APPLICABILITY[followUp][flow] === true;

export interface TicketCreatedContext {
  supabase: SupabaseClient;
  accountId: string;
  ticketId: string;
  /** The flow that created the ticket; it picks the activities that run. */
  source: TicketCreationFlow;
  ticketNumber: number | null;
  conversationId: string | null;
  channelIntegrationId: string | null;
  gmailThreadId: string | null;
  gmailMessageId: string;
  /** RFC 2822 Message-ID header of the inbound email, for In-Reply-To. */
  messageIdHeader: string | null;
  subject: string;
  /** Raw "From" header. */
  fromHeader: string;
  customerDisplayName: string | null;
  category: string | null;
  receivedAt: string;
  /** The inbound email, for the shadow classification. */
  emailMessage?: EmailMessage;
  /** The proposal written for this ticket, when the flow creates one. */
  proposalId?: string | null;
}

function logFailure(source: string, what: string, ticketId: string, err: unknown): void {
  console.error(`[${source}] ${what} failed for ticket ${ticketId}:`, err);
}

/** The proposal that receives the escalation reasons: the one the flow just wrote, else the ticket's latest. */
async function resolveEscalationTarget(
  supabase: SupabaseClient,
  accountId: string,
  ticketId: string,
  proposalId: string | null
): Promise<string | null> {
  if (proposalId) return proposalId;
  const { data } = await supabase
    .from("ticket_proposals")
    .select("id")
    .eq("account_id", accountId)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Everything a brand-new ticket gets, whichever flow created it: potential
 * clients, the semantic index, the shadow classification, the escalation
 * check, the acknowledgement and the out-of-hours reply. Both replies refuse
 * emails older than their freshness window, so a historical scan never writes
 * to a customer. Nothing here blocks or fails ticket creation.
 */
export async function runTicketCreatedFollowUps(ctx: TicketCreatedContext): Promise<void> {
  const { supabase, accountId, ticketId, source } = ctx;

  if (applies("contact-extraction", source)) triggerContactExtraction(ticketId, accountId, source);

  if (applies("semantic-index", source)) {
    requestSemanticIndexing(supabase, accountId, [{ kind: "ticket", id: ticketId }]).catch((err: unknown) =>
      logFailure(source, "Embedding generation", ticketId, err)
    );
  }

  if (applies("shadow-classification", source) && ctx.emailMessage && getFlag("enable_jev_shadow_classification")) {
    runJevShadowClassification(ctx.emailMessage, { accountId, ticketId });
  }

  if (applies("escalation-detection", source)) {
    resolveEscalationTarget(supabase, accountId, ticketId, ctx.proposalId ?? null)
      .then(async (proposalId) => {
        if (!proposalId) {
          console.warn(`[${source}] Escalation detection has no proposal to store into for ticket ${ticketId}`);
          return;
        }
        const { buildEscalationContext } = await import("../routes/v1/tickets.js");
        const escalationCtx = await buildEscalationContext(ticketId, accountId);
        if (!escalationCtx) return;
        const { reasons } = detectEscalationTriggers(escalationCtx);
        if (reasons.length === 0) return;
        await supabase.from("ticket_proposals").update({ escalation_reasons: reasons }).eq("id", proposalId);
      })
      .catch((err: unknown) => logFailure(source, "Escalation detection", ticketId, err));
  }

  // The acknowledgement goes first; when it goes out the customer must not also
  // get the out-of-hours reply for the same email.
  const ackOutcome =
    !applies("acknowledgement", source) || ctx.ticketNumber === null
      ? { sent: false as const }
      : await maybeSendTicketAcknowledgement({
          supabase,
          accountId,
          ticketId,
          ticketNumber: ctx.ticketNumber,
          conversationId: ctx.conversationId,
          channelIntegrationId: ctx.channelIntegrationId,
          gmailThreadId: ctx.gmailThreadId,
          subject: ctx.subject,
          fromHeader: ctx.fromHeader,
          customerDisplayName: ctx.customerDisplayName,
          category: ctx.category,
          receivedAt: ctx.receivedAt,
          messageIdHeader: ctx.messageIdHeader,
        }).catch((err: unknown) => {
          logFailure(source, "Acknowledgement", ticketId, err);
          return { sent: false as const };
        });

  if (applies("out-of-hours-reply", source) && !ackOutcome.sent && isFreshForAutoReply(ctx.receivedAt)) {
    getFreshGmailToken(accountId)
      .then((gmailAccessToken) =>
        maybeSendOutOfHoursReply({
          supabase,
          accountId,
          ticketId,
          gmailAccessToken,
          gmailThreadId: ctx.gmailThreadId,
          gmailMessageId: ctx.gmailMessageId,
          fromHeader: ctx.fromHeader,
          subject: ctx.subject,
          receivedAt: ctx.receivedAt,
        })
      )
      .catch((err: unknown) => logFailure(source, "Out-of-hours reply", ticketId, err));
  }
}
