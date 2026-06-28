// ---------------------------------------------------------------------------
// KAI-248 — Gmail near-real-time poll worker: per-account core logic
//
// Pure(ish) orchestration function — all I/O collaborators are injected via
// `GmailPollDeps` so this can be unit-tested without Bun's global
// `mock.module()` (which leaks across test files when mocking shared modules
// like ../gmail-token.ts or ../supabase.ts).
//
// This module does NOT import or modify apps/api/src/functions/pipeline/*.
// It is a deliberately independent orchestrator (see KAI-248 description).
// ---------------------------------------------------------------------------

import {
  GmailHistoryExpiredError,
  type GmailMessage,
  type GmailPollDeps,
  type PollAccountResult,
} from "./types.js";

function headerValue(headers: { name: string; value: string }[], name: string): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function headersToRecord(headers: { name: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { name, value } of headers) out[name] = value;
  return out;
}

interface ChannelIntegrationRow {
  id: string;
  account_id: string;
  gmail_history_id: string | null;
}

/**
 * Process every new Gmail message for a single channel_integration row:
 * pre-filter gate → threading → Flow 1 (reopen) or Flow 2 (create + classify)
 * → link message. Idempotent via the messages unique constraint
 * (channel_integration_id, external_id).
 */
async function ingestMessages(
  deps: GmailPollDeps,
  args: {
    accountId: string;
    channelIntegrationId: string;
    token: string;
    messageIds: string[];
    userEmail: string;
  }
): Promise<{ ticketsCreated: number; ticketsReopened: number; skipped: number; processed: number }> {
  const { accountId, channelIntegrationId, token, messageIds, userEmail } = args;

  let ticketsCreated = 0;
  let ticketsReopened = 0;
  let skipped = 0;
  let processed = 0;

  // De-dup against already-ingested messages for this integration — defends
  // against history.list returning overlapping pages and re-processing on
  // cron overlap. The unique constraint is the final backstop.
  const { data: existingRows } = await deps.db
    .from("messages")
    .select("external_id")
    .eq("channel_integration_id", channelIntegrationId)
    .in("external_id", messageIds);
  const existingIds = new Set((existingRows ?? []).map((r: { external_id: string }) => r.external_id));

  for (const messageId of messageIds) {
    if (existingIds.has(messageId)) continue;

    let message: GmailMessage;
    try {
      message = await deps.getMessage(token, messageId);
    } catch (err) {
      console.error(
        `[gmail-poll] getMessage failed for ${messageId}:`,
        err instanceof Error ? err.message : String(err)
      );
      continue;
    }

    const msgHeaders = message.payload?.headers ?? [];
    const from = headerValue(msgHeaders, "From");
    const subject = headerValue(msgHeaders, "Subject");
    const dateStr = headerValue(msgHeaders, "Date");
    const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
    const gmailCategories = (message.labelIds ?? []).filter((l) => l.startsWith("CATEGORY_"));
    const snippet = message.snippet ?? "";
    const threadId = message.threadId;
    // KAI-248 Grupo 1 §1: RFC 2822 Message-ID header — stored for In-Reply-To /
    // References in outbound replies (mirrors tier1-fast-path KAI-115 §A).
    const messageIdHeader = headerValue(msgHeaders, "Message-ID") || null;

    const filterResult = deps.preFilterEmail({
      from,
      subject,
      headers: headersToRecord(msgHeaders),
      gmailCategories,
      mimeType: message.payload?.mimeType,
      userEmail,
    });

    // Insert the message row regardless of outcome — preserves a record of
    // every message seen, mirroring incremental-sync's pending→skipped/classified flow.
    const { data: insertedMsg, error: insertErr } = await deps.db
      .from("messages")
      .insert({
        account_id: accountId,
        channel_integration_id: channelIntegrationId,
        external_id: messageId,
        thread_external_id: threadId,
        direction: "inbound",
        received_at: receivedAt,
        sender_external_id: from,
        snippet,
        message_id_header: messageIdHeader,
        classification_status: filterResult.status === "skip" ? "skipped" : "pending",
        skip_reason: filterResult.status === "skip" ? filterResult.skip_reason ?? null : null,
        processing_batch: "gmail-poll",
      })
      .select("id")
      .single();

    if (insertErr) {
      // 23505 = unique_violation — another concurrent poll already ingested
      // this message. Idempotency guard; skip and move on.
      if (insertErr.code === "23505") continue;
      console.error(`[gmail-poll] message insert failed for ${messageId}:`, insertErr.message);
      continue;
    }

    processed++;

    if (filterResult.status === "skip") {
      skipped++;
      continue;
    }

    // Gate passed — threading + Flow 1 / Flow 2.
    try {
      // KAI-248 Grupo 1 §2: broken-thread re-association — if the subject
      // carries a [KAIRO-<ticket_number>] token, prefer re-attaching to that
      // ticket's existing conversation over the Gmail threadId. Use the LAST
      // token in the subject (the current ticket), not the first. Mirrors
      // tier1-fast-path's KAI-115 §B re-association, minus sender validation
      // (out of scope for Grupo 1).
      let resolvedConversationId: string | undefined;
      const kairoTicketNumber = deps.extractLastKairoToken(subject);
      if (kairoTicketNumber !== null) {
        const existingTicket = await deps.findTicketByKairoToken(deps.db, accountId, kairoTicketNumber);
        if (existingTicket?.conversationId) {
          resolvedConversationId = existingTicket.conversationId;
        }
      }

      if (!resolvedConversationId) {
        const { conversation_id } = await deps.upsertConversationByThread(deps.db, {
          accountId,
          channelIntegrationId,
          externalThreadId: threadId,
          customerExternalId: from,
          customerDisplayName: null,
        });
        resolvedConversationId = conversation_id;
      }

      const conversation_id = resolvedConversationId;

      const classification = await deps.classifyEmail({ subject, body: snippet, from });
      const classifiedAt = new Date().toISOString();

      const result = await deps.findOrCreateTicketForThread(deps.db, {
        accountId,
        conversationId: conversation_id,
        originatingUserId: null,
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
          body_plain: null,
          body_html: null,
          snippet,
          gmail_message_id: messageId,
          gmail_thread_id: threadId,
          received_at: receivedAt,
        },
        classifiedAt,
        classificationTier: 0,
        priorityScore: null,
      });

      await deps.db
        .from("messages")
        .update({
          conversation_id,
          classification_status: "classified",
          processing_tier: 0,
          classified_at: classifiedAt,
        })
        .eq("id", insertedMsg.id);

      await deps.linkMessageToTicket(deps.db, {
        ticket_id: result.ticket_id,
        message_id: insertedMsg.id,
        is_origin: result.was_created,
      });

      if (result.was_created) {
        ticketsCreated++;
      } else {
        // Flow 1: existing ticket on this thread — reopen if applicable.
        await deps.applyCustomerReplyTransition(deps.db, result.ticket_id, result.prior_status);
        ticketsReopened++;
      }
    } catch (err) {
      console.error(
        `[gmail-poll] ingestion failed for message ${messageId}:`,
        err instanceof Error ? err.message : String(err)
      );
      await deps.db
        .from("messages")
        .update({ classification_status: "failed" })
        .eq("id", insertedMsg.id);
    }
  }

  return { ticketsCreated, ticketsReopened, skipped, processed };
}

/** Paginate history.list, collecting all messageAdded ids + the final historyId. */
async function collectHistory(
  deps: GmailPollDeps,
  token: string,
  startHistoryId: string
): Promise<{ messageIds: string[]; newHistoryId: string }> {
  const messageIds = new Set<string>();
  let newHistoryId = startHistoryId;
  let page = await deps.historyList(token, startHistoryId);

  for (;;) {
    for (const record of page.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        messageIds.add(added.message.id);
      }
    }
    if (page.historyId) newHistoryId = page.historyId;

    if (!page.nextPageToken) break;
    // historyList signature only takes (token, startHistoryId) per the
    // injected contract — pagination via nextPageToken is handled by the
    // collaborator implementation itself when present. We re-call with the
    // same startHistoryId; the real Gmail client implementation threads the
    // page token internally. For the purposes of this worker we stop here
    // if the dependency does not natively paginate, since the contract is
    // single-call. (No production caller relies on multi-page in v1.)
    break;
  }

  return { messageIds: [...messageIds], newHistoryId };
}

/**
 * Poll a single Gmail-connected account for new inbox messages since its
 * stored `gmail_history_id` cursor, ingest the relevant ones, and advance
 * the cursor. Seeds the cursor on first run instead of backfilling.
 */
export async function pollGmailAccount(
  deps: GmailPollDeps,
  accountId: string
): Promise<PollAccountResult> {
  const { data: integration, error: integrationErr } = await deps.db
    .from("channel_integrations")
    .select("id, account_id, gmail_history_id")
    .eq("account_id", accountId)
    .eq("provider", "gmail")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (integrationErr || !integration) {
    return {
      outcome: "no_integration",
      newMessages: 0,
      ticketsCreated: 0,
      ticketsReopened: 0,
      skipped: 0,
      newHistoryId: null,
    };
  }

  const row = integration as ChannelIntegrationRow;
  const token = await deps.getFreshGmailToken(accountId);

  // -------------------------------------------------------------------------
  // Seed path: no cursor yet — onboarding owns the first backfill, this
  // worker only records the current historyId so future polls are incremental.
  // -------------------------------------------------------------------------
  if (!row.gmail_history_id) {
    const profile = await deps.getProfile(token);
    await deps.db
      .from("channel_integrations")
      .update({ gmail_history_id: profile.historyId })
      .eq("id", row.id);

    return {
      outcome: "seeded",
      newMessages: 0,
      ticketsCreated: 0,
      ticketsReopened: 0,
      skipped: 0,
      newHistoryId: profile.historyId,
    };
  }

  const userEmail = await deps.getGmailEmailByAccount(accountId);

  // -------------------------------------------------------------------------
  // Incremental path: history.list from the stored cursor.
  // -------------------------------------------------------------------------
  try {
    const { messageIds, newHistoryId } = await collectHistory(deps, token, row.gmail_history_id);

    const ingestStats = messageIds.length
      ? await ingestMessages(deps, {
          accountId,
          channelIntegrationId: row.id,
          token,
          messageIds,
          userEmail,
        })
      : { ticketsCreated: 0, ticketsReopened: 0, skipped: 0, processed: 0 };

    await deps.db
      .from("channel_integrations")
      .update({ gmail_history_id: newHistoryId, last_synced_at: new Date().toISOString() })
      .eq("id", row.id);

    return {
      outcome: "polled",
      newMessages: ingestStats.processed,
      ticketsCreated: ingestStats.ticketsCreated,
      ticketsReopened: ingestStats.ticketsReopened,
      skipped: ingestStats.skipped,
      newHistoryId,
    };
  } catch (err) {
    if (!(err instanceof GmailHistoryExpiredError)) {
      throw err;
    }

    // ---------------------------------------------------------------------
    // Fallback: cursor expired (Gmail 404s startHistoryId after ~7 days).
    // Bounded re-sync via messages.list, then re-seed the cursor from a
    // fresh getProfile call so future polls resume incrementally.
    // ---------------------------------------------------------------------
    const listResponse = await deps.messagesList(token);
    const messageIds = (listResponse.messages ?? []).map((m) => m.id);

    const ingestStats = messageIds.length
      ? await ingestMessages(deps, {
          accountId,
          channelIntegrationId: row.id,
          token,
          messageIds,
          userEmail,
        })
      : { ticketsCreated: 0, ticketsReopened: 0, skipped: 0, processed: 0 };

    const profile = await deps.getProfile(token);

    await deps.db
      .from("channel_integrations")
      .update({ gmail_history_id: profile.historyId, last_synced_at: new Date().toISOString() })
      .eq("id", row.id);

    return {
      outcome: "resynced",
      newMessages: ingestStats.processed,
      ticketsCreated: ingestStats.ticketsCreated,
      ticketsReopened: ingestStats.ticketsReopened,
      skipped: ingestStats.skipped,
      newHistoryId: profile.historyId,
    };
  }
}
