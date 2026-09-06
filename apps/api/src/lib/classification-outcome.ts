import type { SupabaseClient } from "@supabase/supabase-js";
import { ProviderError } from "@kairo/intelligence";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

export interface RecordClassificationFailureArgs {
  supabase: DbClient;
  accountId: string;
  channelIntegrationId: string;
  externalId: string;
  threadExternalId?: string | null;
  receivedAt: string;
  senderExternalId?: string | null;
  senderDisplayName?: string | null;
  subject?: string | null;
  snippet?: string | null;
  bodyPlain?: string | null;
  bodyHtml?: string | null;
  messageIdHeader?: string | null;
  processingTier: number;
  err: unknown;
  maxAttempts: number;
}

/**
 * Persists a failed classification attempt with everything a later retry
 * needs (Plan E): the full message content (previously only bare status was
 * written — a message that failed could never be reclassified because
 * nothing was saved to reclassify), the incremented attempt count, and the
 * correct terminal-vs-retryable status.
 *
 * A ProviderError with `retriable: false` (bad request, schema mismatch —
 * will fail identically every time) goes straight to 'failed_permanent'
 * without waiting to exhaust attempts, since retrying it is guaranteed
 * wasted work. A retriable error goes to 'failed' (eligible for
 * classification-retry-sweep) until `maxAttempts` is reached, then also
 * becomes 'failed_permanent'. A non-ProviderError (unexpected bug) is
 * treated as retriable — attempt count still bounds it eventually, but it
 * isn't assumed permanent on the first occurrence.
 */
export async function recordClassificationFailure(args: RecordClassificationFailureArgs): Promise<void> {
  const { supabase, accountId, channelIntegrationId, externalId, maxAttempts, err } = args;

  const { data: existing } = await supabase
    .from("messages")
    .select("classification_attempt_count")
    .eq("channel_integration_id", channelIntegrationId)
    .eq("external_id", externalId)
    .maybeSingle();

  const attemptCount = (existing?.classification_attempt_count ?? 0) + 1;
  const retriable = err instanceof ProviderError ? err.retriable : true;
  const classificationStatus = !retriable || attemptCount >= maxAttempts ? "failed_permanent" : "failed";

  await supabase.from("messages").upsert(
    {
      account_id: accountId,
      channel_integration_id: channelIntegrationId,
      external_id: externalId,
      thread_external_id: args.threadExternalId ?? null,
      direction: "inbound",
      received_at: args.receivedAt,
      sender_external_id: args.senderExternalId ?? null,
      sender_display_name: args.senderDisplayName ?? null,
      subject: args.subject ?? null,
      snippet: args.snippet ?? null,
      body_plain: args.bodyPlain ?? null,
      body_html: args.bodyHtml ?? null,
      message_id_header: args.messageIdHeader ?? null,
      classification_status: classificationStatus,
      classification_attempt_count: attemptCount,
      last_classification_attempt_at: new Date().toISOString(),
      processing_tier: args.processingTier,
    },
    { onConflict: "channel_integration_id,external_id" }
  );
}
