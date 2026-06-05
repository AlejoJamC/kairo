import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

export interface UpsertConversationArgs {
  accountId: string;
  channelIntegrationId: string;
  externalThreadId: string;
  customerExternalId: string; // usually the From email
  customerDisplayName?: string | null;
}

export interface UpsertConversationResult {
  conversation_id: string;
  was_created: boolean;
}

/**
 * Upsert a conversation keyed by (account_id, channel_integration_id, external_thread_id).
 * Uses the partial UNIQUE index idx_conversations_account_channel_thread added in KAI-165.
 *
 * Idempotent: safe to call multiple times for the same thread.
 */
export async function upsertConversationByThread(
  client: DbClient,
  args: UpsertConversationArgs
): Promise<UpsertConversationResult> {
  const { accountId, channelIntegrationId, externalThreadId, customerExternalId, customerDisplayName } = args;

  // INSERT ... ON CONFLICT DO NOTHING; returns the row only on actual insert.
  const { data: inserted, error: insertErr } = await client
    .from("conversations")
    .insert({
      account_id: accountId,
      channel_integration_id: channelIntegrationId,
      external_thread_id: externalThreadId,
      customer_external_id: customerExternalId,
      customer_display_name: customerDisplayName ?? null,
    })
    .select("id")
    .single();

  if (insertErr) {
    // 23505 = unique_violation — already exists
    if (insertErr.code !== "23505") {
      throw new Error(`[conversations] upsert failed: ${insertErr.message}`);
    }
    // Already exists — fetch it
    const { data: existing, error: fetchErr } = await client
      .from("conversations")
      .select("id")
      .eq("account_id", accountId)
      .eq("channel_integration_id", channelIntegrationId)
      .eq("external_thread_id", externalThreadId)
      .single();

    if (fetchErr || !existing) {
      throw new Error(
        `[conversations] failed to re-read after conflict: ${fetchErr?.message ?? "no row"}`
      );
    }
    return { conversation_id: existing.id, was_created: false };
  }

  // Inserted row returned
  if (!inserted) {
    // Should not happen with .single() after successful insert, but guard anyway
    throw new Error("[conversations] insert returned no data");
  }

  return { conversation_id: inserted.id, was_created: true };
}
