import type { SupabaseClient } from "@supabase/supabase-js";
import { transitionTicketStatus, TICKET_CREATED_TRIGGER } from "./ticket-transition.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

export interface FindOrCreateTicketArgs {
  accountId: string;
  conversationId: string;
  originatingUserId: string | null;
  classification: {
    type: string;
    category: string | null;
    priority: string;
    tone: string | null;
    confidence: number;
    reasoning: string | null;
  };
  originMessage: {
    subject: string;
    from_email: string;
    from_name: string | null;
    to_email: string | null;
    body_plain: string | null;
    body_html: string | null;
    snippet: string | null;
    gmail_message_id: string;
    gmail_thread_id: string;
    received_at: string;
  };
  classifiedAt: string;
  classificationTier: number;
  priorityScore: number | null;
}

export interface FindOrCreateTicketResult {
  ticket_id: string;
  ticket_number: number;
  was_created: boolean;
  prior_status: string | null; // when was_created=false; for transitions
}

/**
 * Find or create the canonical ticket for a conversation thread.
 *
 * - If a non-merged ticket already exists for this conversation → return it
 *   without reclassifying (decision KAI-165 #1).
 * - If none exists → INSERT with full classification. The partial UNIQUE index
 *   idx_tickets_account_conversation_active protects against race conditions.
 * - On 23505 race → re-read and return was_created=false.
 */
export async function findOrCreateTicketForThread(
  client: DbClient,
  args: FindOrCreateTicketArgs
): Promise<FindOrCreateTicketResult> {
  const { accountId, conversationId, originatingUserId, classification, originMessage, classifiedAt, classificationTier, priorityScore } = args;

  // 1. Look for an existing active ticket for this conversation
  const { data: existing } = await client
    .from("tickets")
    .select("id, ticket_number, status")
    .eq("account_id", accountId)
    .eq("conversation_id", conversationId)
    .is("merged_into_ticket_id", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      ticket_id: existing.id,
      ticket_number: existing.ticket_number,
      was_created: false,
      prior_status: existing.status ?? null,
    };
  }

  // 2. No existing ticket — create one
  const { data: inserted, error: insertErr } = await client
    .from("tickets")
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      originating_user_id: originatingUserId,
      subject: originMessage.subject,
      from_email: originMessage.from_email,
      from_name: originMessage.from_name,
      to_email: originMessage.to_email,
      body_plain: originMessage.body_plain,
      body_html: originMessage.body_html,
      snippet: originMessage.snippet,
      gmail_message_id: originMessage.gmail_message_id,
      gmail_thread_id: originMessage.gmail_thread_id,
      received_at: originMessage.received_at,
      ticket_type: classification.type,
      priority: classification.priority,
      category: classification.category,
      sentiment: classification.tone,
      emotion: classification.tone,
      ai_reasoning: classification.reasoning,
      classification_confidence: classification.confidence,
      emotion_confidence: classification.confidence,
      classified_at: classifiedAt,
      classification_tier: classificationTier,
      priority_score: priorityScore,
      score_computed_at: classifiedAt,
      // KAI-191: the ticket must be valid and visible the instant it exists
      // — status filters (`.not("status", "in", (...))`, the SLA cron's
      // `.in("status", OPEN_STATUSES)`) evaluate to NULL, not TRUE, against a
      // NULL status, so a NULL-status ticket is invisible everywhere. This
      // INSERT and the transitionTicketStatus() call below are two separate
      // round trips with no shared transaction, so status is set to 'open'
      // here directly rather than left NULL for the RPC to fill in — if the
      // trail-row call below fails, the ticket is still open and visible;
      // only its t0 history row is missing (apply_ticket_transition()
      // special-cases trigger='ticket_created' to still record that row even
      // though status already equals 'open').
      status: "open",
    })
    .select("id, ticket_number")
    .single();

  if (insertErr) {
    if (insertErr.code !== "23505") {
      throw new Error(`[tickets-by-thread] insert failed: ${insertErr.message}`);
    }
    // Race condition — another worker inserted between our SELECT and INSERT
    const { data: raceRow, error: raceErr } = await client
      .from("tickets")
      .select("id, ticket_number, status")
      .eq("account_id", accountId)
      .eq("conversation_id", conversationId)
      .is("merged_into_ticket_id", null)
      .limit(1)
      .maybeSingle();

    if (raceErr || !raceRow) {
      throw new Error(
        `[tickets-by-thread] race re-read failed: ${raceErr?.message ?? "no row"}`
      );
    }
    return {
      ticket_id: raceRow.id,
      ticket_number: raceRow.ticket_number,
      was_created: false,
      prior_status: raceRow.status ?? null,
    };
  }

  if (!inserted) {
    throw new Error("[tickets-by-thread] insert returned no data");
  }

  // Only a genuinely new ticket (this branch, not the 23505 race re-read
  // above) records a creation row: from_state=NULL, to_state='open'.
  //
  // The ticket row above is already committed with status='open' — it is
  // valid and visible regardless of what happens next. If this call fails
  // (network, timeout, RPC error), do not throw: that would turn a merely
  // degraded write (ticket visible, missing its t0 trail row — the same gap
  // every ticket had before KAI-191) into a failed ingestion for a ticket
  // that in fact exists and is fine. Log it and return the usable ticket.
  const transition = await transitionTicketStatus(client, {
    ticketId: inserted.id,
    toState: "open",
    actorType: "system",
    actorRef: "tickets-by-thread",
    trigger: TICKET_CREATED_TRIGGER,
  });
  if (transition.outcome !== "applied") {
    console.error(
      `[tickets-by-thread] failed to record ticket_created trail row for ${inserted.id}: ${transition.outcome}`
    );
  }

  return {
    ticket_id: inserted.id,
    ticket_number: inserted.ticket_number,
    was_created: true,
    prior_status: null,
  };
}
