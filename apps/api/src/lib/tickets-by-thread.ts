import type { SupabaseClient } from "@supabase/supabase-js";

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
    .select("id, status")
    .eq("account_id", accountId)
    .eq("conversation_id", conversationId)
    .is("merged_into_ticket_id", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      ticket_id: existing.id,
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
      status: "open",
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code !== "23505") {
      throw new Error(`[tickets-by-thread] insert failed: ${insertErr.message}`);
    }
    // Race condition — another worker inserted between our SELECT and INSERT
    const { data: raceRow, error: raceErr } = await client
      .from("tickets")
      .select("id, status")
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
      was_created: false,
      prior_status: raceRow.status ?? null,
    };
  }

  if (!inserted) {
    throw new Error("[tickets-by-thread] insert returned no data");
  }

  return {
    ticket_id: inserted.id,
    was_created: true,
    prior_status: null,
  };
}
