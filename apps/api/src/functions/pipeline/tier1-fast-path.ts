import { classifyEmail, detectEscalationTriggers } from "@kairo/intelligence";
import { preFilterEmail } from "../../lib/email/pre-filter.js";
import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import { env } from "../../env.js";
import { computePriorityScore, DEFAULT_WEIGHTS } from "../../lib/scoring.js";
import { resolveModelVersion } from "../../lib/model-version.js";
import { buildEscalationContext } from "../../routes/v1/tickets.js";
import { maybeSendOutOfHoursReply } from "../../lib/out-of-hours-reply.js";
import { maybeGenerateTicketEmbedding } from "../../lib/ticket-embedding.js";

// ---------------------------------------------------------------------------
// Gmail API types
// ---------------------------------------------------------------------------

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailProfile {
  emailAddress: string;
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
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

async function gmailGet<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
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

async function fetchGmailProfile(token: string): Promise<GmailProfile> {
  return gmailGet<GmailProfile>(token, "users/me/profile");
}

async function fetchGmailMessages(token: string, maxResults: number): Promise<GmailMessage[]> {
  const list = await gmailGet<GmailListResponse>(token, "users/me/messages", {
    maxResults: String(maxResults),
    labelIds: "INBOX",
  });

  const ids = list.messages ?? [];
  if (ids.length === 0) return [];

  const metaParams = new URLSearchParams({ format: "metadata" });
  for (const h of METADATA_HEADERS) metaParams.append("metadataHeaders", h);
  const paramStr = metaParams.toString();

  const settled = await Promise.allSettled(
    ids.map(({ id }) =>
      fetch(`${GMAIL_BASE}/users/me/messages/${id}?${paramStr}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? (r.json() as Promise<GmailMessage>) : null))
    )
  );

  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((m): m is GmailMessage => m !== null);
}

function headerValue(headers: GmailHeader[], name: string): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
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

export const tier1FastPath = inngest.createFunction(
  {
    id: "tier1-fast-path",
    concurrency: { limit: env.FAST_PATH_CONCURRENCY },
  },
  { event: "pipeline/tier1.triggered" },
  async ({ event, step }) => {
    const { userId, gmailAccessToken } = event.data;

    // -----------------------------------------------------------------------
    // Step 1: Fetch Gmail profile + 30 most recent message headers in parallel
    // -----------------------------------------------------------------------
    const { messages, userEmail } = await step.run("fetch-headers", async () => {
      const [profile, msgs] = await Promise.all([
        fetchGmailProfile(gmailAccessToken),
        fetchGmailMessages(gmailAccessToken, env.FAST_PATH_SCAN_SIZE),
      ]);
      return { messages: msgs, userEmail: profile.emailAddress };
    });

    // -----------------------------------------------------------------------
    // Step 2: Pre-filter, classify in parallel, persist each result
    // -----------------------------------------------------------------------
    const result = await step.run("scan-and-dispatch", async () => {
      const classifiedIds: string[] = [];
      const skippedIds: string[] = [];
      const remainderIds: string[] = [];

      // One-time lookup: Gmail channel_integration for this user (service role)
      const { data: channelRow } = await supabase
        .from("channel_integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .limit(1)
        .single();

      const channelIntegrationId: string | null = channelRow?.id ?? null;

      const classificationPromises: Promise<void>[] = [];
      let relevantDispatched = 0;

      for (const message of messages) {
        // Escape once we've dispatched enough relevant classifications
        if (relevantDispatched >= env.FAST_PATH_ESCAPE_COUNT) {
          remainderIds.push(message.id);
          continue;
        }

        const headers = message.payload?.headers ?? [];
        const from = headerValue(headers, "From");
        const subject = headerValue(headers, "Subject");
        const dateStr = headerValue(headers, "Date");
        const receivedAt = dateStr
          ? new Date(dateStr).toISOString()
          : new Date().toISOString();
        const gmailCategories = (message.labelIds ?? []).filter((l) =>
          l.startsWith("CATEGORY_")
        );

        const filterResult = preFilterEmail({
          from,
          subject,
          headers: headersToRecord(headers),
          gmailCategories,
          mimeType: message.payload?.mimeType,
          userEmail,
        });

        if (filterResult.status === "skip") {
          skippedIds.push(message.id);

          if (channelIntegrationId) {
            await supabase.from("messages").upsert(
              {
                channel_integration_id: channelIntegrationId,
                external_id: message.id,
                direction: "inbound",
                received_at: receivedAt,
                sender_external_id: from,
                snippet: message.snippet ?? null,
                classification_status: "skipped",
                skip_reason: filterResult.skip_reason,
                processing_tier: 1,
              },
              { onConflict: "channel_integration_id,external_id" }
            );
          }
          continue;
        }

        // Relevant — capture loop-local values for the closure, then dispatch
        relevantDispatched++;
        const messageId = message.id;
        const snippet = message.snippet ?? "";

        const promise = classifyEmail({ subject, body: snippet, from })
          .then(async (classification) => {
            classifiedIds.push(messageId);
            const classified_at = new Date().toISOString();

            const priorityScore = computePriorityScore(
              {
                type: classification.type,
                tone: classification.tone,
                plan: "none",
                receivedAt: receivedAt,
                recentTicketCount: 0,
              },
              DEFAULT_WEIGHTS
            );

            // Stage classification as an auto-approved proposal before persisting the ticket
            const { data: proposal } = await supabase
              .from("ticket_proposals")
              .insert({
                conversation_id: null,
                message_ids: [],
                proposed_type: classification.type,
                proposed_category: classification.category,
                proposed_priority: classification.priority,
                proposed_sentiment: classification.tone,
                proposed_emotion: classification.tone,
                emotion_confidence: classification.confidence,
                confidence_score: classification.confidence,
                model_version: resolveModelVersion(),
                raw_llm_output: classification as Record<string, unknown>,
                status: "auto_approved",
              })
              .select("id")
              .single();

            const { data: ticket } = await supabase
              .from("tickets")
              .insert({
                user_id: userId,
                subject,
                from_email: from,
                gmail_message_id: messageId,
                gmail_thread_id: message.threadId,
                received_at: receivedAt,
                ticket_type: classification.type,
                priority: classification.priority,
                category: classification.category,
                sentiment: classification.tone,
                ai_reasoning: classification.reasoning,
                classification_confidence: classification.confidence,
                classified_at,
                classification_tier: 1,
                priority_score: priorityScore,
                emotion: classification.tone,
                emotion_confidence: classification.confidence,
                score_computed_at: classified_at,
              })
              .select("id")
              .single();

            // Link proposal → ticket
            if (proposal?.id && ticket?.id) {
              await supabase
                .from("ticket_proposals")
                .update({ ticket_id: ticket.id })
                .eq("id", proposal.id);

              // Detect escalation triggers post-classification (fire-and-forget)
              buildEscalationContext(ticket.id, userId)
                .then((ctx) => {
                  if (!ctx) return;
                  const result = detectEscalationTriggers(ctx);
                  if (result.reasons.length > 0) {
                    return supabase
                      .from("ticket_proposals")
                      .update({ escalation_reasons: result.reasons })
                      .eq("id", proposal.id);
                  }
                })
                .catch((err: unknown) => {
                  console.error(`[tier1] Escalation detection failed for ticket ${ticket.id}:`, err);
                });
            }

            if (channelIntegrationId) {
              await supabase.from("messages").upsert(
                {
                  channel_integration_id: channelIntegrationId,
                  external_id: messageId,
                  direction: "inbound",
                  received_at: receivedAt,
                  sender_external_id: from,
                  snippet: snippet || null,
                  classification_status: "classified",
                  processing_tier: 1,
                  classified_at,
                },
                { onConflict: "channel_integration_id,external_id" }
              );
            }

            if (ticket?.id) {
              maybeSendOutOfHoursReply({
                supabase,
                userId,
                ticketId: ticket.id,
                gmailAccessToken,
                gmailThreadId: message.threadId,
                gmailMessageId: messageId,
                fromHeader: from,
                subject,
                receivedAt,
              }).catch((err: unknown) => {
                console.error(`[tier1] Out-of-hours reply failed for ticket ${ticket.id}:`, err);
              });

              maybeGenerateTicketEmbedding({
                supabase,
                ticketId: ticket.id,
                subject,
                bodyPreview: snippet,
              }).catch((err: unknown) => {
                console.error(`[tier1] Embedding generation failed for ticket ${ticket.id}:`, err);
              });
            }
          })
          .catch(async (err: unknown) => {
            const detail = err instanceof Error ? err.message : String(err);
            console.error(`[tier1] Classification failed for ${messageId}: ${detail}`);

            if (channelIntegrationId) {
              await supabase.from("messages").upsert(
                {
                  channel_integration_id: channelIntegrationId,
                  external_id: messageId,
                  direction: "inbound",
                  received_at: receivedAt,
                  classification_status: "failed",
                  processing_tier: 1,
                },
                { onConflict: "channel_integration_id,external_id" }
              );
            }
          });

        classificationPromises.push(promise);
      }

      // All parallel classification calls run to completion before step exits
      await Promise.all(classificationPromises);

      return { classifiedIds, skippedIds, remainderIds };
    });

    // -----------------------------------------------------------------------
    // Step 3: Emit Tier 2 trigger with all IDs already processed
    // -----------------------------------------------------------------------
    await step.sendEvent("trigger-tier2", {
      name: "pipeline/tier2.triggered",
      data: {
        userId,
        processedMessageIds: [...result.classifiedIds, ...result.skippedIds],
      },
    });
  }
);
