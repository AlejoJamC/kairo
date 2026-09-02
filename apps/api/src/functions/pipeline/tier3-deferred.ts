import { classifyEmailWithMeta, stripQuotedThread } from "@kairo/intelligence";
import { logLlmCall } from "../../lib/llm-logging.js";
import { preFilterEmail } from "../../lib/email/pre-filter.js";
import { inngest } from "../../lib/inngest.js";
import { getFreshGmailToken, getGmailEmailByAccount } from "../../lib/gmail-token.js";
import { supabase } from "../../lib/supabase.js";
import { env } from "../../env.js";
import { computePriorityScore, DEFAULT_WEIGHTS } from "../../lib/scoring.js";
import { resolveModelVersion } from "../../lib/model-version.js";
import { upsertConversationByThread } from "../../lib/conversations.js";
import { findOrCreateTicketForThread } from "../../lib/tickets-by-thread.js";
import { linkMessageToTicket } from "../../lib/ticket-messages.js";
import { applyCustomerReplyTransition } from "../../lib/ticket-thread-transitions.js";
import { emitTicketClassification } from "../../lib/ticket-events.js";

// KAI-191: tier3 writes priority/category onto every ticket it creates, but
// used to leave no trace of that AI decision — the human correction path did,
// via classification_feedback/the old events table, this did not. One row per
// dimension actually set (category is nullable on tickets; priority is not).
// Only called for brand-new tickets (from_value is always null — an existing
// ticket's classification is never touched here, per KAI-165 decision #1).
async function recordAiClassification(
  accountId: string,
  ticketId: string,
  classification: { category: string | null; priority: string; confidence: number },
  occurredAt: string
): Promise<void> {
  const modelVersion = resolveModelVersion();
  if (classification.category) {
    await emitTicketClassification({
      accountId,
      ticketId,
      actorType: "ai",
      actorRef: "tier3-deferred",
      dimension: "category",
      applied: true,
      fromValue: null,
      toValue: classification.category,
      confidence: classification.confidence,
      modelVersion,
      occurredAt,
    });
  }
  await emitTicketClassification({
    accountId,
    ticketId,
    actorType: "ai",
    actorRef: "tier3-deferred",
    dimension: "priority",
    applied: true,
    fromValue: null,
    toValue: classification.priority,
    confidence: classification.confidence,
    modelVersion,
    occurredAt,
  });
}

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

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
    mimeType?: string;
    body?: { data?: string; size?: number };
    parts?: GmailMessagePart[];
  };
}

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";


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
      // format=full returns headers + MIME tree, same call this tier already made
      // (one GET per id) — matches Tier 1 (KAI-93): the classifier needs the real
      // body, not the ~200-char Gmail snippet, and format=full costs the same
      // quota as format=metadata (5 units/call); only payload size differs.
      const settled = await Promise.allSettled(
        ids.map(({ id }) =>
          fetch(`${GMAIL_BASE}/users/me/messages/${id}?format=full`, {
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

// Cap body sent to the classifier — matches Tier 1's CLASSIFIER_BODY_MAX_CHARS.
const CLASSIFIER_BODY_MAX_CHARS = 2000;

// Walks the MIME tree extracting decoded text/plain and text/html parts.
// Same decoder as Tier 1 (KAI-93): Gmail returns part data base64url-encoded,
// and Buffer's "base64" decoder accepts URL-safe variants on both Node and Bun.
function extractBody(payload: GmailMessage["payload"]): {
  body_plain: string;
  body_html: string;
} {
  let body_plain = "";
  let body_html = "";

  const walk = (parts: GmailMessagePart[]): void => {
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        body_plain += Buffer.from(part.body.data, "base64").toString("utf-8");
      } else if (part.mimeType === "text/html" && part.body?.data) {
        body_html += Buffer.from(part.body.data, "base64").toString("utf-8");
      } else if (part.parts) {
        walk(part.parts);
      }
    }
  };

  if (payload?.parts) {
    walk(payload.parts);
  } else if (payload?.body?.data) {
    const decoded = Buffer.from(payload.body.data, "base64").toString("utf-8");
    if (payload.mimeType === "text/html") body_html = decoded;
    else body_plain = decoded;
  }

  return { body_plain, body_html };
}

// ---------------------------------------------------------------------------
// Shared classifyWindow helper
// ---------------------------------------------------------------------------

async function classifyWindow(
  userId: string,
  accountId: string,
  accessToken: string,
  userEmail: string,
  channelIntegrationId: string | null,
  daysFrom: number,
  daysTo: number
): Promise<void> {
  const messages = await fetchGmailRange(accessToken, daysFrom, daysTo);

  if (messages.length === 0) return;

  // Dedup: check tickets table directly by (account_id, gmail_message_id).
  // Previously checked the messages table but that's only populated when
  // channel_integrations exists — unreliable. Tickets table is the source of truth.
  const externalIds = messages.map((m) => m.id);
  const { data: existing } = await supabase
    .from("tickets")
    .select("gmail_message_id")
    .eq("account_id", accountId)
    .in("gmail_message_id", externalIds);

  const processedIds = new Set(
    (existing ?? []).map((r) => r.gmail_message_id).filter(Boolean)
  );

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
            account_id:             accountId,
            channel_integration_id: channelIntegrationId,
            external_id: message.id,
            direction: "inbound",
            received_at: receivedAt,
            sender_external_id: from,
            snippet: message.snippet ?? null,
            body_plain: null,
            body_html: null,
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
    const threadId = message.threadId;
    const snippet = message.snippet ?? "";
    const { body_plain, body_html } = extractBody(message.payload);
    const classifierBody = stripQuotedThread(body_plain || snippet)
      .slice(0, CLASSIFIER_BODY_MAX_CHARS);

    const llmStart = Date.now();
    const promise = classifyEmailWithMeta({ subject, body: classifierBody, from, tenantMailbox: userEmail })
      .then(async ({ result: classification, meta, prompt, promptVersion }) => {
        logLlmCall({
          feature: "email_classification",
          model: meta.model,
          promptVersion,
          promptText: prompt,
          responseText: meta.rawText,
          promptTokens: meta.usage.promptTokens,
          completionTokens: meta.usage.completionTokens,
          confidenceScore: classification.confidence,
          latencyMs: Date.now() - llmStart,
          triggeredByUserId: userId,
          accountId,
        });
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

        // KAI-181: group by thread instead of one ticket per message —
        // tier2/tier3 were the two paths that never adopted this (tier1
        // and incremental-sync already had it).
        let ticketId: string | null = null;
        let was_created = true;
        let prior_status: string | null = null;

        if (channelIntegrationId) {
          try {
            const { conversation_id } = await upsertConversationByThread(supabase, {
              accountId,
              channelIntegrationId,
              externalThreadId: threadId,
              customerExternalId: from,
              customerDisplayName: null,
            });

            const result = await findOrCreateTicketForThread(supabase, {
              accountId,
              conversationId: conversation_id,
              originatingUserId: userId,
              classification: {
                type: classification.type,
                category: classification.category,
                priority: classification.priority,
                tone: classification.tone,
                confidence: classification.confidence,
                reasoning: classification.reasoning,
              },
              originMessage: {
                subject,
                from_email: from,
                from_name: null,
                to_email: null,
                body_plain: body_plain || null,
                body_html: body_html || null,
                snippet: snippet || null,
                gmail_message_id: messageId,
                gmail_thread_id: threadId,
                received_at: receivedAt,
              },
              classifiedAt: classified_at,
              classificationTier: 3,
              priorityScore,
            });
            ticketId = result.ticket_id;
            was_created = result.was_created;
            prior_status = result.prior_status;

            if (proposal?.id) {
              await supabase
                .from("ticket_proposals")
                .update({ ticket_id: ticketId })
                .eq("id", proposal.id);
            }

            const { data: messageRow } = await supabase.from("messages").upsert(
              {
                account_id:             accountId,
                conversation_id,
                channel_integration_id: channelIntegrationId,
                external_id: messageId,
                thread_external_id: threadId,
                direction: "inbound",
                received_at: receivedAt,
                sender_external_id: from,
                snippet: snippet || null,
                body_plain: body_plain || null,
                body_html: body_html || null,
                classification_status: "classified",
                processing_tier: 3,
                classified_at,
              },
              { onConflict: "channel_integration_id,external_id" }
            ).select("id").single();

            if (messageRow?.id) {
              await linkMessageToTicket(supabase, {
                ticket_id: ticketId,
                message_id: messageRow.id,
                is_origin: was_created,
              });
            }

            if (was_created && ticketId) {
              await recordAiClassification(accountId, ticketId, classification, classified_at);
            }

            if (!was_created) {
              await applyCustomerReplyTransition(supabase, ticketId, prior_status);
            }
          } catch (helperErr: unknown) {
            console.error(
              `[tier3] thread helpers failed for ${messageId}:`,
              helperErr instanceof Error ? helperErr.message : String(helperErr)
            );
            // Fallback: insert ticket without conversation linkage
            const { data: fallbackTicket } = await supabase
              .from("tickets")
              .insert({
                account_id:          accountId,
                originating_user_id: userId,
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
                classification_tier: 3,
                priority_score: priorityScore,
                emotion: classification.tone,
                emotion_confidence: classification.confidence,
                score_computed_at: classified_at,
              })
              .select("id")
              .single();
            ticketId = fallbackTicket?.id ?? null;

            if (ticketId) {
              await recordAiClassification(accountId, ticketId, classification, classified_at);
            }

            if (proposal?.id && ticketId) {
              await supabase
                .from("ticket_proposals")
                .update({ ticket_id: ticketId })
                .eq("id", proposal.id);
            }

            await supabase.from("messages").upsert(
              {
                account_id:             accountId,
                channel_integration_id: channelIntegrationId,
                external_id: messageId,
                direction: "inbound",
                received_at: receivedAt,
                sender_external_id: from,
                snippet: snippet || null,
                body_plain: body_plain || null,
                body_html: body_html || null,
                classification_status: "classified",
                processing_tier: 3,
                classified_at,
              },
              { onConflict: "channel_integration_id,external_id" }
            );
          }
        } else {
          // No channelIntegrationId — insert ticket directly, no conversation linkage possible
          const { data: bareTicket } = await supabase
            .from("tickets")
            .insert({
              account_id:          accountId,
              originating_user_id: userId,
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
              classification_tier: 3,
              priority_score: priorityScore,
              emotion: classification.tone,
              emotion_confidence: classification.confidence,
              score_computed_at: classified_at,
            })
            .select("id")
            .single();
          ticketId = bareTicket?.id ?? null;

          if (ticketId) {
            await recordAiClassification(accountId, ticketId, classification, classified_at);
          }

          if (proposal?.id && ticketId) {
            await supabase
              .from("ticket_proposals")
              .update({ ticket_id: ticketId })
              .eq("id", proposal.id);
          }
        }
      })
      .catch(async (err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(
          `[tier3] Classification failed for ${messageId}: ${detail}`
        );

        logLlmCall({
          feature: "email_classification",
          model: resolveModelVersion(),
          promptText: `${from} | ${subject}`,
          latencyMs: Date.now() - llmStart,
          errorCode: "LLM_ERROR",
          errorDetail: detail,
          triggeredByUserId: userId,
          accountId,
        });

        if (channelIntegrationId) {
          await supabase.from("messages").upsert(
            {
              account_id:             accountId,
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
    triggers: [{ event: "pipeline/tier3.triggered" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data;

    // -----------------------------------------------------------------------
    // Fetch Gmail credentials + channel integration id once
    // -----------------------------------------------------------------------
    const { accessToken, userEmail, accountId, channelIntegrationId } = (await step.run(
      "fetch-credentials",
      async () => {
        // ADR-022 Phase 2: resolve accountId, read tokens from oauth_credentials.
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
          console.warn(`[tier3] account_id missing for user ${userId} — aborting`);
          return { accessToken: null, userEmail: "", accountId: "", channelIntegrationId: null };
        }

        const [freshToken, email, channelRow] = await Promise.all([
          getFreshGmailToken(accountId).catch(() => null),
          getGmailEmailByAccount(accountId),
          supabase.from("channel_integrations").select("id").eq("account_id", accountId).eq("provider", "gmail").limit(1).single(),
        ]);

        if (!freshToken) {
          console.warn(`[tier3] No Gmail credentials found for account ${accountId}`);
          return { accessToken: null, userEmail: "", accountId, channelIntegrationId: null };
        }

        return {
          accessToken: freshToken,
          userEmail: email,
          accountId,
          channelIntegrationId: channelRow.data?.id ?? null,
        };
      }
    )) as { accessToken: string | null; userEmail: string; accountId: string; channelIntegrationId: string | null };

    if (!accessToken || !accountId) return;

    // -----------------------------------------------------------------------
    // Batch A: 16–30 days
    // -----------------------------------------------------------------------
    await step.run("batch-a-16-30d", async () => {
      await classifyWindow(
        userId,
        accountId,
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
        accountId,
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
        accountId,
        accessToken,
        userEmail,
        channelIntegrationId,
        61,
        env.MAX_EMAIL_AGE_DAYS
      );
    });
  }
);
