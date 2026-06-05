/**
 * Duplicate of apps/api/src/lib/tickets-by-thread.ts for use in the Next.js landing app.
 * NOTE: Keep in sync with the canonical version in apps/api/src/lib/tickets-by-thread.ts.
 * Reason: apps/api is a Bun server — its lib cannot be imported by Next.js directly
 * without creating a new shared package (out of scope per KAI-165 plan decision #6).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

export interface FindOrCreateTicketArgs {
  accountId: string;
  conversationId: string;
  originatingUserId: string | null;
  classification?: {
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
}

export interface FindOrCreateTicketResult {
  ticket_id: string;
  was_created: boolean;
  prior_status: string | null;
}

export async function findOrCreateTicketForThread(
  client: DbClient,
  args: FindOrCreateTicketArgs
): Promise<FindOrCreateTicketResult> {
  const { accountId, conversationId, originatingUserId, classification, originMessage } = args;

  // 1. Look for existing active ticket
  const { data: existing } = await client
    .from("tickets")
    .select("id, status")
    .eq("account_id", accountId)
    .eq("conversation_id", conversationId)
    .is("merged_into_ticket_id", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { ticket_id: existing.id, was_created: false, prior_status: existing.status ?? null };
  }

  // 2. Create new ticket
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
      ticket_type: classification?.type ?? null,
      priority: classification?.priority ?? null,
      category: classification?.category ?? null,
      sentiment: classification?.tone ?? null,
      emotion: classification?.tone ?? null,
      ai_reasoning: classification?.reasoning ?? null,
      classification_confidence: classification?.confidence ?? null,
      emotion_confidence: classification?.confidence ?? null,
      status: "open",
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code !== "23505") {
      throw new Error(`[tickets-by-thread] insert failed: ${insertErr.message}`);
    }
    // Race
    const { data: raceRow, error: raceErr } = await client
      .from("tickets")
      .select("id, status")
      .eq("account_id", accountId)
      .eq("conversation_id", conversationId)
      .is("merged_into_ticket_id", null)
      .limit(1)
      .maybeSingle();

    if (raceErr || !raceRow) {
      throw new Error(`[tickets-by-thread] race re-read failed: ${raceErr?.message ?? "no row"}`);
    }
    return { ticket_id: raceRow.id, was_created: false, prior_status: raceRow.status ?? null };
  }

  if (!inserted) throw new Error("[tickets-by-thread] insert returned no data");

  return { ticket_id: inserted.id, was_created: true, prior_status: null };
}
