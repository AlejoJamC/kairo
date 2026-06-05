/**
 * Duplicate of apps/api/src/lib/conversations.ts for use in the Next.js landing app.
 * NOTE: Keep in sync with the canonical version in apps/api/src/lib/conversations.ts.
 * Reason: apps/api is a Bun server — its lib cannot be imported by Next.js directly
 * without creating a new shared package (out of scope per KAI-165 plan decision #6).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

export interface UpsertConversationArgs {
  accountId: string;
  channelIntegrationId: string;
  externalThreadId: string;
  customerExternalId: string;
  customerDisplayName?: string | null;
}

export interface UpsertConversationResult {
  conversation_id: string;
  was_created: boolean;
}

export async function upsertConversationByThread(
  client: DbClient,
  args: UpsertConversationArgs
): Promise<UpsertConversationResult> {
  const { accountId, channelIntegrationId, externalThreadId, customerExternalId, customerDisplayName } = args;

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
    if (insertErr.code !== "23505") {
      throw new Error(`[conversations] upsert failed: ${insertErr.message}`);
    }
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

  if (!inserted) {
    throw new Error("[conversations] insert returned no data");
  }

  return { conversation_id: inserted.id, was_created: true };
}
