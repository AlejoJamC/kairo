import { classifyEmail } from "@kairo/intelligence";
import { preFilterEmail } from "../../lib/email/pre-filter.js";
import { inngest } from "../../lib/inngest.js";
import { getFreshGmailToken } from "../../lib/gmail-token.js";
import { supabase } from "../../lib/supabase.js";
import { env } from "../../env.js";
import { computePriorityScore, DEFAULT_WEIGHTS } from "../../lib/scoring.js";
import { resolveModelVersion } from "../../lib/model-version.js";

// ---------------------------------------------------------------------------
// Gmail API types (shared shape with Tier 1)
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
 * Fetch all Gmail message headers from the last `windowDays` days.
 * Paginates automatically — may return hundreds of messages.
 */
async function fetchGmailWindow(
  token: string,
  windowDays: number
): Promise<GmailMessage[]> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const afterStr = windowStart.toISOString().slice(0, 10).replace(/-/g, "/");

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

export const tier2Background = inngest.createFunction(
  {
    id: "tier2-background",
    concurrency: { limit: env.BACKGROUND_CONCURRENCY },
    triggers: [{ event: "pipeline/tier2.triggered" }],
  },
  async ({ event, step }) => {
    const { userId, processedMessageIds } = event.data;

    // -----------------------------------------------------------------------
    // Step 1: Fetch Gmail credentials + full 0–N day window
    // -----------------------------------------------------------------------
    const { messages, userEmail } = await step.run(
      "fetch-0-15d-headers",
      async () => {
        const [freshToken, gmailAccount] = await Promise.all([
          getFreshGmailToken(userId),
          supabase.from("gmail_accounts").select("email").eq("user_id", userId).limit(1).single(),
        ]);

        if (!gmailAccount.data?.email) {
          console.warn(`[tier2] No Gmail account found for user ${userId}`);
          return { messages: [] as GmailMessage[], userEmail: "" };
        }

        const msgs = await fetchGmailWindow(freshToken, env.TIER_2_WINDOW_DAYS);

        return {
          messages: msgs,
          userEmail: gmailAccount.data.email as string,
        };
      }
    // Inngest's JsonifyObject loses interface field types across step boundaries; cast back
    ) as { messages: GmailMessage[]; userEmail: string };

    if (messages.length === 0) {
      console.warn(`[tier2] No messages in window for user ${userId}`);
    }

    // -----------------------------------------------------------------------
    // Step 2: Exclude messages already handled by Tier 1
    // -----------------------------------------------------------------------
    const unprocessed = (await step.run("filter-unprocessed", async () => {
      return messages.filter((h) => !processedMessageIds.includes(h.id));
    })) as GmailMessage[];

    // -----------------------------------------------------------------------
    // Step 3: Pre-filter + classify all survivors
    // -----------------------------------------------------------------------
    await step.run("classify-batch", async () => {
      if (unprocessed.length === 0) return;

      // Resolve account_id — required for tickets insert (NOT NULL constraint)
      const { data: memberRow } = await supabase
        .from("account_members")
        .select("account_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const accountId: string | null = memberRow?.account_id ?? null;

      const { data: channelRow } = await supabase
        .from("channel_integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .limit(1)
        .single();

      const channelIntegrationId: string | null = channelRow?.id ?? null;

      const classificationPromises: Promise<void>[] = [];

      for (const message of unprocessed) {
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
                processing_tier: 2,
              },
              { onConflict: "channel_integration_id,external_id" }
            );
          }
          continue;
        }

        // Relevant — capture loop-local values for the closure
        const messageId = message.id;
        const snippet = message.snippet ?? "";

        const promise = classifyEmail({ subject, body: snippet, from })
          .then(async (classification) => {
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

            const { data: ticket, error: ticketErr } = await supabase
              .from("tickets")
              .insert({
                account_id: accountId,
                user_id: userId,
                subject,
                from_email: from,
                gmail_message_id: messageId,
                ticket_type: classification.type,
                priority: classification.priority,
                category: classification.category,
                sentiment: classification.tone,
                ai_reasoning: classification.reasoning,
                classification_confidence: classification.confidence,
                classified_at,
                classification_tier: 2,
                priority_score: priorityScore,
                emotion: classification.tone,
                emotion_confidence: classification.confidence,
                score_computed_at: classified_at,
              })
              .select("id")
              .single();


            if (proposal?.id && ticket?.id) {
              await supabase
                .from("ticket_proposals")
                .update({ ticket_id: ticket.id })
                .eq("id", proposal.id);
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
                  processing_tier: 2,
                  classified_at,
                },
                { onConflict: "channel_integration_id,external_id" }
              );
            }
          })
          .catch(async (err: unknown) => {
            const detail = err instanceof Error ? err.message : String(err);
            console.error(
              `[tier2] Classification failed for ${messageId}: ${detail}`
            );

            if (channelIntegrationId) {
              await supabase.from("messages").upsert(
                {
                  channel_integration_id: channelIntegrationId,
                  external_id: messageId,
                  direction: "inbound",
                  received_at: receivedAt,
                  classification_status: "failed",
                  processing_tier: 2,
                },
                { onConflict: "channel_integration_id,external_id" }
              );
            }
          });

        classificationPromises.push(promise);
      }

      await Promise.allSettled(classificationPromises);
    });

    // -----------------------------------------------------------------------
    // Step 4: Trigger Tier 3
    // -----------------------------------------------------------------------
    await step.sendEvent("trigger-tier3", {
      name: "pipeline/tier3.triggered",
      data: { userId },
    });
  }
);
