import { classifyEmail } from "@kairo/intelligence";
import { preFilterEmail } from "../../lib/email/pre-filter.js";
import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import { env } from "../../env.js";
import { computePriorityScore, DEFAULT_WEIGHTS } from "../../lib/scoring.js";
import { resolveModelVersion } from "../../lib/model-version.js";

// ---------------------------------------------------------------------------
// Gmail API types (shared shape with Tier 1 & 2)
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

function daysAgoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10).replace(/-/g, "/");
}

/**
 * Fetch Gmail message headers within a [daysFrom, daysTo] window.
 * Uses both `after:` and `before:` Gmail query params.
 */
async function fetchGmailRange(
  token: string,
  daysFrom: number,
  daysTo: number
): Promise<GmailMessage[]> {
  const afterStr = daysAgoDate(daysTo);
  const beforeStr = daysAgoDate(daysFrom);

  const metaParams = new URLSearchParams({ format: "metadata" });
  for (const h of METADATA_HEADERS) metaParams.append("metadataHeaders", h);
  const metaParamStr = metaParams.toString();

  const allMessages: GmailMessage[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      maxResults: "500",
      labelIds: "INBOX",
      q: `after:${afterStr} before:${beforeStr}`,
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
// Shared classifyWindow helper
// ---------------------------------------------------------------------------

async function classifyWindow(
  userId: string,
  accessToken: string,
  userEmail: string,
  channelIntegrationId: string | null,
  daysFrom: number,
  daysTo: number
): Promise<void> {
  const messages = await fetchGmailRange(accessToken, daysFrom, daysTo);

  if (messages.length === 0) return;

  // Resumability: fetch already-processed external_ids for this window
  const externalIds = messages.map((m) => m.id);
  const { data: existing } = await supabase
    .from("messages")
    .select("external_id")
    .in("external_id", externalIds)
    .not("classification_status", "is", null);

  const processedIds = new Set((existing ?? []).map((r) => r.external_id));

  const classificationPromises: Promise<void>[] = [];

  for (const message of messages) {
    if (processedIds.has(message.id)) continue;

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
            processing_tier: 3,
          },
          { onConflict: "channel_integration_id,external_id" }
        );
      }
      continue;
    }

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

        const { data: ticket } = await supabase
          .from("tickets")
          .insert({
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
            classification_tier: 3,
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
              processing_tier: 3,
              classified_at,
            },
            { onConflict: "channel_integration_id,external_id" }
          );
        }
      })
      .catch(async (err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(
          `[tier3] Classification failed for ${messageId}: ${detail}`
        );

        if (channelIntegrationId) {
          await supabase.from("messages").upsert(
            {
              channel_integration_id: channelIntegrationId,
              external_id: messageId,
              direction: "inbound",
              received_at: receivedAt,
              classification_status: "failed",
              processing_tier: 3,
            },
            { onConflict: "channel_integration_id,external_id" }
          );
        }
      });

    classificationPromises.push(promise);
  }

  await Promise.allSettled(classificationPromises);
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const tier3Deferred = inngest.createFunction(
  {
    id: "tier3-deferred",
    concurrency: { limit: env.BACKGROUND_CONCURRENCY },
  },
  { event: "pipeline/tier3.triggered" },
  async ({ event, step }) => {
    const { userId } = event.data;

    // -----------------------------------------------------------------------
    // Fetch Gmail credentials + channel integration id once
    // -----------------------------------------------------------------------
    const { accessToken, userEmail, channelIntegrationId } = (await step.run(
      "fetch-credentials",
      async () => {
        const { data: gmailAccount } = await supabase
          .from("gmail_accounts")
          .select("access_token, email")
          .eq("user_id", userId)
          .limit(1)
          .single();

        if (!gmailAccount?.access_token) {
          console.warn(`[tier3] No Gmail account found for user ${userId}`);
          return { accessToken: null, userEmail: "", channelIntegrationId: null };
        }

        const { data: channelRow } = await supabase
          .from("channel_integrations")
          .select("id")
          .eq("user_id", userId)
          .eq("provider", "gmail")
          .limit(1)
          .single();

        return {
          accessToken: gmailAccount.access_token as string,
          userEmail: gmailAccount.email as string,
          channelIntegrationId: channelRow?.id ?? null,
        };
      }
    )) as { accessToken: string | null; userEmail: string; channelIntegrationId: string | null };

    if (!accessToken) return;

    // -----------------------------------------------------------------------
    // Batch A: 16–30 days
    // -----------------------------------------------------------------------
    await step.run("batch-a-16-30d", async () => {
      await classifyWindow(
        userId,
        accessToken,
        userEmail,
        channelIntegrationId,
        16,
        30
      );
    });

    // -----------------------------------------------------------------------
    // Batch B: 31–60 days
    // -----------------------------------------------------------------------
    await step.run("batch-b-31-60d", async () => {
      await classifyWindow(
        userId,
        accessToken,
        userEmail,
        channelIntegrationId,
        31,
        60
      );
    });

    // -----------------------------------------------------------------------
    // Batch C: 61–MAX_EMAIL_AGE_DAYS days
    // -----------------------------------------------------------------------
    await step.run("batch-c-61-maxd", async () => {
      await classifyWindow(
        userId,
        accessToken,
        userEmail,
        channelIntegrationId,
        61,
        env.MAX_EMAIL_AGE_DAYS
      );
    });
  }
);
