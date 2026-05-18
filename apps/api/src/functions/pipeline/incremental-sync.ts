import { classifyEmail } from "@kairo/intelligence";
import { preFilterEmail } from "../../lib/email/pre-filter.js";
import { inngest } from "../../lib/inngest.js";
import { getFreshGmailToken, getGmailEmailByAccount } from "../../lib/gmail-token.js";
import { supabase } from "../../lib/supabase.js";
import { env } from "../../env.js";
import { maybeSendOutOfHoursReply } from "../../lib/out-of-hours-reply.js";
import { maybeGenerateTicketEmbedding } from "../../lib/ticket-embedding.js";

// ---------------------------------------------------------------------------
// Gmail API types
// ---------------------------------------------------------------------------

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
    mimeType?: string;
  };
}

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";

const METADATA_HEADERS = [
  "From",
  "Subject",
  "Date",
  "List-Unsubscribe",
  "X-Auto-Response-Suppress",
  "Precedence",
  "In-Reply-To",
];

async function gmailGet<T>(
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${GMAIL_BASE}/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch Gmail INBOX headers since `afterDate` (ISO string → YYYY/MM/DD query).
 * Paginates automatically.
 */
async function fetchGmailSince(
  token: string,
  afterDate: string
): Promise<GmailMessage[]> {
  const afterStr = afterDate.slice(0, 10).replace(/-/g, "/");

  const metaParams = new URLSearchParams({ format: "metadata" });
  for (const h of METADATA_HEADERS) metaParams.append("metadataHeaders", h);
  const metaParamStr = metaParams.toString();

  const allMessages: GmailMessage[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      maxResults: "500",
      labelIds: "INBOX",
      q: `after:${afterStr}`,
    };
    if (pageToken) params["pageToken"] = pageToken;

    const list = await gmailGet<GmailListResponse>(
      token,
      "users/me/messages",
      params
    );

    const ids = list.messages ?? [];

    if (ids.length > 0) {
      const settled = await Promise.allSettled(
        ids.map(({ id }) =>
          fetch(`${GMAIL_BASE}/users/me/messages/${id}?${metaParamStr}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((r) => (r.ok ? (r.json() as Promise<GmailMessage>) : null))
        )
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value !== null) {
          allMessages.push(r.value);
        }
      }
    }

    pageToken = list.nextPageToken;
  } while (pageToken);

  return allMessages;
}

function headerValue(headers: GmailHeader[], name: string): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

function headersToRecord(headers: GmailHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { name, value } of headers) out[name] = value;
  return out;
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const incrementalSync = inngest.createFunction(
  {
    id: "incremental-sync",
    concurrency: { limit: env.INCREMENTAL_SYNC_CONCURRENCY },
    triggers: [{ event: "pipeline/incremental-sync.triggered" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data;

    // ADR-022 Phase 2: resolve accountId once (outside steps — idempotent read).
    const { data: memberRow } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const accountId = memberRow?.account_id;
    if (!accountId) {
      console.warn(`[incremental-sync] account_id missing for user ${userId} — aborting`);
      return;
    }

    // -----------------------------------------------------------------------
    // Step 1: Get cursor — MAX(received_at) from already-classified messages
    // -----------------------------------------------------------------------
    const cursor = (await step.run("get-cursor", async () => {
      const { data } = await supabase
        .from("messages")
        .select("received_at")
        .eq("user_id", userId)
        .not("classification_status", "is", null)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data?.received_at ?? null;
    })) as string | null;

    // No prior classified messages — onboarding pipeline handles first-time users
    if (!cursor) return;

    // -----------------------------------------------------------------------
    // Step 2: Fetch Gmail headers since the cursor
    // -----------------------------------------------------------------------
    const headers = (await step.run("fetch-new-emails", async () => {
      const token = await getFreshGmailToken(accountId);
      return fetchGmailSince(token, cursor);
    })) as GmailMessage[];

    if (headers.length === 0) return;

    // -----------------------------------------------------------------------
    // Step 3: Classify new emails
    // -----------------------------------------------------------------------
    await step.run("classify-new-emails", async () => {
      const [gmailAccessToken, userEmail, channelRow] = await Promise.all([
        getFreshGmailToken(accountId),
        getGmailEmailByAccount(accountId),
        supabase
          .from("channel_integrations")
          .select("id")
          .eq("user_id", userId)
          .eq("provider", "gmail")
          .limit(1)
          .single(),
      ]);

      const channelIntegrationId: string | null = channelRow.data?.id ?? null;

      // Collect existing gmail_message_ids for this user to skip duplicates
      const incomingIds = headers.map((m) => m.id);
      const { data: existing } = await supabase
        .from("messages")
        .select("external_id")
        .in("external_id", incomingIds);

      const existingIds = new Set((existing ?? []).map((r) => r.external_id));

      const classificationPromises: Promise<void>[] = [];

      for (const message of headers) {
        // Skip messages already in DB
        if (existingIds.has(message.id)) continue;

        const msgHeaders = message.payload?.headers ?? [];
        const from = headerValue(msgHeaders, "From");
        const subject = headerValue(msgHeaders, "Subject");
        const dateStr = headerValue(msgHeaders, "Date");
        const receivedAt = dateStr
          ? new Date(dateStr).toISOString()
          : new Date().toISOString();
        const gmailCategories = (message.labelIds ?? []).filter((l) =>
          l.startsWith("CATEGORY_")
        );

        // Insert stub with 'pending' status immediately
        if (channelIntegrationId) {
          await supabase.from("messages").insert({
            channel_integration_id: channelIntegrationId,
            external_id: message.id,
            direction: "inbound",
            received_at: receivedAt,
            sender_external_id: from,
            snippet: message.snippet ?? null,
            classification_status: "pending",
            processing_batch: "incremental",
          });
        }

        const filterResult = preFilterEmail({
          from,
          subject,
          headers: headersToRecord(msgHeaders),
          gmailCategories,
          mimeType: message.payload?.mimeType,
          userEmail,
        });

        if (filterResult.status === "skip") {
          if (channelIntegrationId) {
            await supabase
              .from("messages")
              .update({
                classification_status: "skipped",
                skip_reason: filterResult.skip_reason,
              })
              .eq("external_id", message.id)
              .eq("channel_integration_id", channelIntegrationId);
          }
          continue;
        }

        // Relevant — classify asynchronously, capture loop-local vars
        const messageId = message.id;
        const snippet = message.snippet ?? "";

        const threadId = message.threadId;

        const promise = classifyEmail({ subject, body: snippet, from })
          .then(async (classification) => {
            const classified_at = new Date().toISOString();

            const [insertResult] = await Promise.all([
              supabase
                .from("tickets")
                .insert({
                  user_id: userId,
                  subject,
                  from_email: from,
                  gmail_message_id: messageId,
                  gmail_thread_id: threadId,
                  received_at: receivedAt,
                  ticket_type: classification.type,
                  priority: classification.priority,
                  category: classification.category,
                  sentiment: classification.tone,
                  ai_reasoning: classification.reasoning,
                  classification_confidence: classification.confidence,
                  classified_at,
                  classification_tier: 0,
                })
                .select("id")
                .single(),
              channelIntegrationId
                ? supabase
                    .from("messages")
                    .update({
                      classification_status: "classified",
                      processing_tier: 0,
                      classified_at,
                    })
                    .eq("external_id", messageId)
                    .eq("channel_integration_id", channelIntegrationId)
                : Promise.resolve(),
            ]);

            const ticketId = insertResult?.data?.id;
            if (ticketId) {
              maybeSendOutOfHoursReply({
                supabase,
                userId,
                ticketId,
                gmailAccessToken,
                gmailThreadId: threadId,
                gmailMessageId: messageId,
                fromHeader: from,
                subject,
                receivedAt,
              }).catch((err: unknown) => {
                console.error(
                  `[incremental-sync] Out-of-hours reply failed for ticket ${ticketId}:`,
                  err
                );
              });

              maybeGenerateTicketEmbedding({
                supabase,
                ticketId,
                subject,
                bodyPreview: snippet,
              }).catch((err: unknown) => {
                console.error(
                  `[incremental-sync] Embedding generation failed for ticket ${ticketId}:`,
                  err
                );
              });
            }
          })
          .catch(async (err: unknown) => {
            const detail = err instanceof Error ? err.message : String(err);
            console.error(
              `[incremental-sync] Classification failed for ${messageId}: ${detail}`
            );

            if (channelIntegrationId) {
              await supabase
                .from("messages")
                .update({ classification_status: "failed" })
                .eq("external_id", messageId)
                .eq("channel_integration_id", channelIntegrationId);
            }
          });

        classificationPromises.push(promise);

        // Respect INCREMENTAL_SYNC_CONCURRENCY by draining in chunks
        if (classificationPromises.length >= env.INCREMENTAL_SYNC_CONCURRENCY) {
          await Promise.allSettled(classificationPromises.splice(0));
        }
      }

      // Drain remaining
      if (classificationPromises.length > 0) {
        await Promise.allSettled(classificationPromises);
      }
    });
  }
);
