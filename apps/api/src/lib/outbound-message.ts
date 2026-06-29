import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelSendResult } from "./channels/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Outbox bookkeeping helpers for outbound `messages` rows (KAI-114 / ADR-023 §1).
 *
 * The HTTP endpoint enqueues by inserting a `queued` row; the Inngest worker
 * drives it through `sending -> sent | failed`. These helpers centralize the
 * delivery_status transitions so both call sites stay consistent.
 *
 * All writes use the service-role client — RLS write is not granted to users.
 */

export interface MarkSendingResult {
  alreadySent: boolean;
}

/**
 * Transitions a message to `sending` and increments `send_attempts`.
 *
 * Idempotency guard: if the message is already `sent` (e.g. a duplicate/
 * retried event), this is a no-op and returns `{ alreadySent: true }` so the
 * caller can skip the send.
 */
export async function markMessageSending(client: DbClient, messageId: string): Promise<MarkSendingResult> {
  const { data: current, error: fetchError } = await client
    .from("messages")
    .select("delivery_status, send_attempts")
    .eq("id", messageId)
    .single();

  if (fetchError || !current) {
    throw new Error(`[outbound-message] markMessageSending: message ${messageId} not found`);
  }

  if (current.delivery_status === "sent") {
    return { alreadySent: true };
  }

  const { error } = await client
    .from("messages")
    .update({
      delivery_status: "sending",
      send_attempts: (current.send_attempts ?? 0) + 1,
    })
    .eq("id", messageId);

  if (error) {
    throw new Error(`[outbound-message] markMessageSending failed for ${messageId}: ${error.message}`);
  }

  return { alreadySent: false };
}

/**
 * Marks a message as `sent` and records the provider's identifiers + raw payload.
 *
 * KAI-248 Group 2: also persists `message_id_header` — the RFC 2822 Message-ID
 * of the email we just sent — when the channel sender was able to report it
 * (e.g. Gmail's `messages.get` follow-up in gmail-send.ts). This mirrors how
 * inbound messages already store their own `message_id_header` (KAI-115), so a
 * future customer reply that quotes/threads off *this* outbound message can be
 * resolved back to In-Reply-To/References the same way. Left untouched
 * (`undefined` -> omitted from the update) when the provider couldn't report
 * it, so we never overwrite a previous value with null on a retry.
 */
export async function markMessageSent(
  client: DbClient,
  messageId: string,
  result: ChannelSendResult,
): Promise<void> {
  const { error } = await client
    .from("messages")
    .update({
      delivery_status: "sent",
      external_id: result.providerMessageId,
      thread_external_id: result.providerThreadId,
      raw_payload: { provider_message_id: result.providerMessageId, provider_thread_id: result.providerThreadId },
      ...(result.providerMessageIdHeader ? { message_id_header: result.providerMessageIdHeader } : {}),
    })
    .eq("id", messageId);

  if (error) {
    throw new Error(`[outbound-message] markMessageSent failed for ${messageId}: ${error.message}`);
  }
}

export interface SendErrorDetail {
  code: string;
  message?: string;
}

/**
 * Marks a message as definitively `failed` with the error detail.
 *
 * Never throws — failure helpers must be safe to call from catch/onFailure paths.
 */
export async function markMessageFailed(client: DbClient, messageId: string, error: SendErrorDetail): Promise<void> {
  try {
    await client
      .from("messages")
      .update({
        delivery_status: "failed",
        send_error: { code: error.code, message: error.message ?? null },
      })
      .eq("id", messageId);
  } catch (updateErr) {
    console.error(`[outbound-message] markMessageFailed: could not update message ${messageId}:`, updateErr);
  }
}
