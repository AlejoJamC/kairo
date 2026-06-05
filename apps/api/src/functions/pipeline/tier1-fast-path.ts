import { classifyEmail, detectEscalationTriggers } from "@kairo/intelligence";
import { getFlag } from "@kairo/feature-flags";
import { preFilterEmail } from "../../lib/email/pre-filter.js";
import { inngest } from "../../lib/inngest.js";
import { getFreshGmailToken } from "../../lib/gmail-token.js";
import { supabase } from "../../lib/supabase.js";
import { env } from "../../env.js";
import { computePriorityScore, DEFAULT_WEIGHTS } from "../../lib/scoring.js";
import { resolveModelVersion } from "../../lib/model-version.js";
import { buildEscalationContext } from "../../routes/v1/tickets.js";
import { maybeSendOutOfHoursReply } from "../../lib/out-of-hours-reply.js";
import { maybeGenerateTicketEmbedding } from "../../lib/ticket-embedding.js";
import { pipelineLog, pipelineLogRun } from "../../lib/pipeline-logger.js";
import { NonRetriableError } from "inngest";
import { upsertConversationByThread } from "../../lib/conversations.js";
import { findOrCreateTicketForThread } from "../../lib/tickets-by-thread.js";
import { linkMessageToTicket } from "../../lib/ticket-messages.js";
import { applyCustomerReplyTransition } from "../../lib/ticket-thread-transitions.js";

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

// Cap body sent to the classifier — headers + body all fit comfortably in the
// prompt budget and we don't want a runaway 100KB email blowing up the LLM call.
const CLASSIFIER_BODY_MAX_CHARS = 2000;

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";

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

  // format=full returns headers + MIME tree (so we can extract body_plain and
  // body_html in the same round-trip). Quota cost is identical to format=metadata
  // (5 units/call); only the payload size differs.
  const settled = await Promise.allSettled(
    ids.map(({ id }) =>
      fetch(`${GMAIL_BASE}/users/me/messages/${id}?format=full`, {
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

// Parses `From` header into display name + email address.
//   "Alice <alice@example.com>"  → { from_name: "Alice", from_email: "alice@example.com" }
//   "bob@example.com"            → { from_name: null,    from_email: "bob@example.com" }
function parseFromHeader(from: string): { from_name: string | null; from_email: string } {
  const match = from.match(/^\s*(.+?)\s*<(.+?)>\s*$/);
  if (match) return { from_name: match[1].trim() || null, from_email: match[2].trim() };
  return { from_name: null, from_email: from.trim() };
}

// Walks the MIME tree extracting decoded text/plain and text/html parts.
// Gmail returns part data base64url-encoded; Buffer's "base64" decoder
// accepts URL-safe variants on both Node and Bun.
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
// Inngest function
// ---------------------------------------------------------------------------

export const tier1FastPath = inngest.createFunction(
  {
    id: "tier1-fast-path",
    concurrency: { limit: env.FAST_PATH_CONCURRENCY },
    triggers: [{ event: "pipeline/tier1.triggered" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data;
    pipelineLogRun(`tier1-fast-path userId=${userId}`);

    // -----------------------------------------------------------------------
    // Step 1: Resolve account, fetch Gmail profile + most recent message headers
    // ADR-022: getFreshGmailToken now takes accountId (Level 4 oauth_credentials).
    // -----------------------------------------------------------------------
    const { messages, userEmail, gmailAccessToken, accountId: resolvedAccountId } = await step.run("fetch-headers", async () => {
      // Resolve accountId before token fetch (required by ADR-022 Phase 2).
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
        throw new NonRetriableError(
          `tier1-fast-path: account_id missing for user ${userId}. ` +
          "The OAuth provisioning step (KAI-218) failed or was skipped. " +
          "Investigate /auth/callback for this user."
        );
      }

      const token = await getFreshGmailToken(accountId);
      const [profile, msgs] = await Promise.all([
        fetchGmailProfile(token),
        fetchGmailMessages(token, env.FAST_PATH_SCAN_SIZE),
      ]);
      pipelineLog("tier1:fetch", `fetched ${msgs.length} messages for ${profile.emailAddress} (scan_size=${env.FAST_PATH_SCAN_SIZE})`);
      return { messages: msgs, userEmail: profile.emailAddress, gmailAccessToken: token, accountId };
    }) as { messages: GmailMessage[]; userEmail: string; gmailAccessToken: string; accountId: string };

    // -----------------------------------------------------------------------
    // Step 2: Pre-filter, classify in parallel, persist each result
    //
    // All messages in the scan window are classified — there is no early exit.
    // FAST_PATH_CONTINUE_THRESHOLD only triggers a log event that the wizard
    // UI polls to enable the "Continue" button; it does not stop classification.
    // -----------------------------------------------------------------------
    const result = await step.run("scan-and-dispatch", async () => {
      const classifiedIds: string[] = [];
      const skippedIds: string[] = [];

      // accountId resolved in fetch-headers step (ADR-022 Phase 2).
      const accountId = resolvedAccountId;
      pipelineLog("tier1:db", `account_id=${accountId}`);

      // One-time lookup: Gmail channel_integration for this user (service role)
      const { data: channelRow } = await supabase
        .from("channel_integrations")
        .select("id")
        .eq("account_id", accountId)
        .eq("provider", "gmail")
        .limit(1)
        .single();

      const channelIntegrationId: string | null = channelRow?.id ?? null;
      pipelineLog("tier1:db", `channel_integration_id=${channelIntegrationId ?? "NULL — messages table will NOT be written"}`);

      const classificationPromises: Promise<void>[] = [];
      let relevantDispatched = 0;

      for (const message of messages) {
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

        // Extract full email body from MIME tree and parse address headers
        // once per message — fields are reused by both the skip and relevant
        // branches (message persistence + classifier + DB inserts).
        const { body_plain, body_html } = extractBody(message.payload);
        const { from_name, from_email } = parseFromHeader(from);
        const to_email = headerValue(headers, "To") || null;
        const snippet = message.snippet ?? "";

        pipelineLog("tier1:filter", `id=${message.id} from="${from}" subject="${subject}" → ${filterResult.status}${filterResult.skip_reason ? ` (${filterResult.skip_reason})` : ""}`);

        if (filterResult.status === "skip") {
          skippedIds.push(message.id);

          if (channelIntegrationId) {
            await supabase.from("messages").upsert(
              {
                account_id:             accountId,
                channel_integration_id: channelIntegrationId,
                external_id: message.id,
                direction: "inbound",
                received_at: receivedAt,
                sender_external_id: from,
                snippet: snippet || null,
                body_plain: body_plain || null,
                body_html: body_html || null,
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

        if (relevantDispatched === env.FAST_PATH_CONTINUE_THRESHOLD) {
          pipelineLog("tier1:threshold", `continue threshold reached (${relevantDispatched}/${env.FAST_PATH_CONTINUE_THRESHOLD}) — wizard Continue button may now be enabled`);
        }

        const messageId = message.id;
        // Prefer the decoded plain-text body for classifier input; fall back to
        // snippet when the email only carried HTML or no decodable text part.
        const classifierBody = (body_plain || snippet).slice(0, CLASSIFIER_BODY_MAX_CHARS);

        pipelineLog("tier1:llm", `calling classifyEmail id=${messageId} subject="${subject}" from="${from}"`);

        const promise = classifyEmail({ subject, body: classifierBody, from })
          .then(async (classification) => {
            pipelineLog("tier1:llm", `id=${messageId} → type=${classification.type} category=${classification.category} priority=${classification.priority} tone=${classification.tone} confidence=${classification.confidence}`);
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
            const { data: proposal, error: proposalErr } = await supabase
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
            if (proposalErr) pipelineLog("tier1:db", `ticket_proposals FAILED for ${messageId}: ${proposalErr.message}`);
            else pipelineLog("tier1:db", `ticket_proposals OK → proposal_id=${proposal?.id}`);

            // KAI-165: upsert conversation by thread, then find-or-create ticket.
            let ticket: { id: string } | null = null;
            let was_created = true;
            let prior_status: string | null = null;

            if (channelIntegrationId) {
              try {
                const { conversation_id } = await upsertConversationByThread(supabase, {
                  accountId,
                  channelIntegrationId,
                  externalThreadId: message.threadId,
                  customerExternalId: from_email,
                  customerDisplayName: from_name,
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
                    from_email,
                    from_name,
                    to_email,
                    body_plain: body_plain || null,
                    body_html: body_html || null,
                    snippet: snippet || null,
                    gmail_message_id: messageId,
                    gmail_thread_id: message.threadId,
                    received_at: receivedAt,
                  },
                  classifiedAt: classified_at,
                  classificationTier: 1,
                  priorityScore,
                });
                ticket = { id: result.ticket_id };
                was_created = result.was_created;
                prior_status = result.prior_status;
                pipelineLog("tier1:db", `tickets OK → ticket_id=${ticket.id} was_created=${was_created}`);

                // Upsert the message row
                const { data: messageRow } = await supabase.from("messages").upsert(
                  {
                    account_id: accountId,
                    conversation_id,
                    channel_integration_id: channelIntegrationId,
                    external_id: messageId,
                    thread_external_id: message.threadId,
                    direction: "inbound",
                    received_at: receivedAt,
                    sender_external_id: from,
                    sender_display_name: from_name,
                    snippet: snippet || null,
                    body_plain: body_plain || null,
                    body_html: body_html || null,
                    classification_status: "classified",
                    processing_tier: 1,
                    classified_at,
                  },
                  { onConflict: "channel_integration_id,external_id" }
                ).select("id").single();

                if (messageRow?.id) {
                  await linkMessageToTicket(supabase, {
                    ticket_id: ticket.id,
                    message_id: messageRow.id,
                    is_origin: was_created,
                  });
                }

                // Apply status transition if this is a follow-up (not the first message)
                if (!was_created) {
                  await applyCustomerReplyTransition(supabase, ticket.id, prior_status);
                }
              } catch (helperErr: unknown) {
                pipelineLog("tier1:db", `thread helpers FAILED for ${messageId}: ${helperErr instanceof Error ? helperErr.message : String(helperErr)}`);
                // Fallback: insert ticket without conversation linkage
                const { data: fallbackTicket, error: ticketErr } = await supabase
                  .from("tickets")
                  .insert({
                    account_id: accountId,
                    originating_user_id: userId,
                    subject,
                    from_email,
                    from_name,
                    to_email,
                    body_plain: body_plain || null,
                    body_html: body_html || null,
                    snippet: snippet || null,
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
                if (ticketErr) pipelineLog("tier1:db", `fallback tickets FAILED for ${messageId}: ${ticketErr.message}`);
                else {
                  ticket = fallbackTicket;
                  pipelineLog("tier1:db", `fallback tickets OK → ticket_id=${ticket?.id}`);
                }
              }
            } else {
              // No channelIntegrationId — insert ticket without conversation linkage
              const { data: bareTicket, error: ticketErr } = await supabase
                .from("tickets")
                .insert({
                  account_id: accountId,
                  originating_user_id: userId,
                  subject,
                  from_email,
                  from_name,
                  to_email,
                  body_plain: body_plain || null,
                  body_html: body_html || null,
                  snippet: snippet || null,
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
              if (ticketErr) pipelineLog("tier1:db", `tickets FAILED for ${messageId}: ${ticketErr.message}`);
              else {
                ticket = bareTicket;
                pipelineLog("tier1:db", `tickets OK (no channel) → ticket_id=${ticket?.id}`);
              }
            }

            // Link proposal → ticket
            if (proposal?.id && ticket?.id) {
              await supabase
                .from("ticket_proposals")
                .update({ ticket_id: ticket.id })
                .eq("id", proposal.id);

              // Detect escalation triggers post-classification (fire-and-forget)
              // Only on new tickets (no reclassification of follow-ups per KAI-165 decision #1)
              if (was_created) {
                buildEscalationContext(ticket.id, accountId)
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
                    console.error(`[tier1] Escalation detection failed for ticket ${ticket!.id}:`, err);
                  });
              }
            }

            if (ticket?.id && was_created) {
              // KAI-225 — Emit contact-extraction trigger (fire-and-forget, non-blocking).
              // Only on ticket creation — not for follow-up messages.
              if (getFlag("enable_contact_extraction")) {
                inngest.send({
                  name: "tickets/ticket.created",
                  data: { ticketId: ticket.id, accountId },
                }).catch((err: unknown) => {
                  console.error(`[tier1] tickets/ticket.created send failed for ticket ${ticket!.id}:`, err);
                });
              }

              maybeSendOutOfHoursReply({
                supabase,
                accountId,
                ticketId: ticket.id,
                gmailAccessToken,
                gmailThreadId: message.threadId,
                gmailMessageId: messageId,
                fromHeader: from,
                subject,
                receivedAt,
              }).catch((err: unknown) => {
                console.error(`[tier1] Out-of-hours reply failed for ticket ${ticket!.id}:`, err);
              });

              maybeGenerateTicketEmbedding({
                supabase,
                ticketId: ticket.id,
                subject,
                bodyPreview: body_plain || snippet,
              }).catch((err: unknown) => {
                console.error(`[tier1] Embedding generation failed for ticket ${ticket!.id}:`, err);
              });
            }
          })
          .catch(async (err: unknown) => {
            const detail = err instanceof Error ? err.message : String(err);
            console.error(`[tier1] Classification failed for ${messageId}: ${detail}`);

            if (channelIntegrationId) {
              await supabase.from("messages").upsert(
                {
                  account_id:             accountId,
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

      pipelineLog("tier1:summary", `classified=${classifiedIds.length} skipped=${skippedIds.length} relevant_total=${relevantDispatched}`);
      return { classifiedIds, skippedIds };
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
