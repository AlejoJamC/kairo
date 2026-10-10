import { extractBody } from "../email/body.js";
import {
  GmailHistoryExpiredError,
  GmailMessageNotFoundError,
  type GmailMessage,
  type GmailPollDeps,
  type PollAccountResult,
} from "./types.js";
import { recordClassificationFailure } from "../classification-outcome.js";
import { env } from "../../env.js";
import { classificationAudit, routingAudit } from "../classification-audit.js";
import { buildEmailClassifierInput, type ClassifierContext } from "../classifier-input.js";
import { headerValue, headersToRecord } from "../email/headers.js";
function extractEmailAddress(raw: string): string {
  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim().toLowerCase();
  const bareMatch = raw.match(/\S+@\S+/);
  return (bareMatch ? bareMatch[0] : raw).trim().toLowerCase();
}


function normalizeEmail(raw: string): string {
  return extractEmailAddress(raw);
}

interface ChannelIntegrationRow {
  id: string;
  account_id: string;
  gmail_history_id: string | null;
}

async function persistCursor(deps: GmailPollDeps, row: ChannelIntegrationRow, historyId: string, synced = true): Promise<void> {
  const update = deps.db.from('channel_integrations').update({ gmail_history_id: historyId,
    ...(synced ? { last_synced_at: new Date().toISOString() } : {}) }).eq('id', row.id);
  const guarded = row.gmail_history_id === null
    ? update.is('gmail_history_id', null) : update.eq('gmail_history_id', row.gmail_history_id);
  const { data, error } = await guarded.select('id');
  if (error || data?.length !== 1) throw new Error('Gmail cursor persistence failed or cursor changed concurrently');
}


export async function ingestMessages(
  deps: GmailPollDeps,
  args: {
    accountId: string;
    channelIntegrationId: string;
    token: string;
    messageIds: string[];
    classifierContext: ClassifierContext;
  }
): Promise<{ ticketsCreated: number; ticketsReopened: number; skipped: number; processed: number }> {
  const { accountId, channelIntegrationId, token, messageIds, classifierContext } = args;

  if (deps.runMessage) {
    const total = { ticketsCreated: 0, ticketsReopened: 0, skipped: 0, processed: 0 };
    for (const id of [...new Set(messageIds)]) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${channelIntegrationId}:${id}`));
      const key = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
      const result = await deps.runMessage(`message-${key}`, () => ingestMessages(
        { ...deps, runMessage: undefined }, { ...args, messageIds: [id] },
      ));
      for (const field of ['ticketsCreated', 'ticketsReopened', 'skipped', 'processed'] as const) total[field] += result[field];
    }
    return total;
  }

  let ticketsCreated = 0;
  let ticketsReopened = 0;
  let skipped = 0;
  let processed = 0;
  const { data: existingRows, error: existingError } = await deps.db
    .from("messages")
    .select("id, external_id, classification_status")
    .eq("channel_integration_id", channelIntegrationId)
    .in("external_id", messageIds);
  if (existingError) throw new Error('Message state lookup failed');
  type ExistingMessage = { id: string; external_id: string; classification_status: string };
  const existing = new Map<string, ExistingMessage>((existingRows ?? []).map((row: ExistingMessage) => [row.external_id, row]));

  for (const messageId of [...new Set(messageIds)]) {
    const prior = existing.get(messageId);
    if (prior && ['classified', 'skipped', 'failed_permanent'].includes(prior.classification_status)) continue;
    let message: GmailMessage;
    try {
      message = await deps.getMessage(token, messageId);
    } catch (err) {
      // Deleted after history listed it: nothing to ingest, and failing the run
      // would keep the cursor in place and hit the same 404 on every poll.
      if (err instanceof GmailMessageNotFoundError) {
        skipped++;
        continue;
      }
      throw err;
    }
    const { body_plain, body_html } = extractBody(message.payload);

    const msgHeaders = message.payload?.headers ?? [];
    const from = headerValue(msgHeaders, "From");
    const subject = headerValue(msgHeaders, "Subject");
    const dateStr = headerValue(msgHeaders, "Date");
    const parsedDate = new Date(dateStr);
    const receivedAt = Number.isNaN(parsedDate.valueOf()) ? new Date().toISOString() : parsedDate.toISOString();
    const gmailCategories = (message.labelIds ?? []).filter((l) => l.startsWith("CATEGORY_"));
    const snippet = message.snippet ?? "";
    const threadId = message.threadId;
    const messageIdHeader = headerValue(msgHeaders, "Message-ID") || null;

    const filterResult = deps.preFilterEmail({
      from,
      subject,
      headers: headersToRecord(msgHeaders),
      gmailCategories,
      mimeType: message.payload?.mimeType,
      userEmail: classifierContext.tenantMailboxes,
    });
    const { data: insertedMsg, error: insertErr } = prior ? { data: prior, error: null } : await deps.db
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
        subject,
        body_plain,
        body_html,
        message_id_header: messageIdHeader,
        classification_status: filterResult.status === "skip" ? "skipped" : "pending",
        ...routingAudit(filterResult.facts),
        skip_reason: filterResult.status === "skip" ? filterResult.skip_reason ?? null : null,
        processing_batch: "gmail-poll",
      })
      .select("id")
      .single();

    if (insertErr || !insertedMsg) throw new Error('Message insertion failed; poll will retry');

    processed++;

    if (filterResult.status === "skip") {
      skipped++;
      continue;
    }
    try {
      let resolvedConversationId: string | undefined;
      const kairoTicketNumber = deps.extractLastKairoToken(subject);
      if (kairoTicketNumber !== null) {
        const existingTicket = await deps.findTicketByKairoToken(deps.db, accountId, kairoTicketNumber);
        if (existingTicket?.conversationId) {
          const conversationCustomer = await deps.getConversationCustomer(
            deps.db,
            existingTicket.conversationId
          );
          const recordedCustomer = conversationCustomer?.customerExternalId ?? null;
          const senderMatches =
            recordedCustomer !== null && normalizeEmail(from) === normalizeEmail(recordedCustomer);

          if (senderMatches) {
            resolvedConversationId = existingTicket.conversationId;
          } else {
            console.warn('[gmail-poll] rejected ticket re-association: sender mismatch');
          }
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
      const llmStart = Date.now();
      let classified: Awaited<ReturnType<GmailPollDeps["classifyEmail"]>>;
      try {
        classified = await deps.classifyEmail(buildEmailClassifierInput({
          stage: "new_email", subject, from, bodyPlain: body_plain, snippet,
          facts: filterResult.facts, context: classifierContext,
        }), { lang: classifierContext.language, context: { accountId } });
      } catch (err) {
        deps.logLlmCall({
          feature: "email_classification",
          model: deps.configuredModel(),
          promptText: `${from} | ${subject}`,
          latencyMs: Date.now() - llmStart,
          errorCode: "LLM_ERROR",
          errorDetail: err instanceof Error ? err.message : String(err),
          accountId,
        });
        throw err;
      }
      const { result: classification, verdict, ensemble, abstain, promptVersion, meta, prompt } = classified;
      deps.logLlmCall({
        feature: "email_classification",
        model: meta.model,
        promptVersion,
        promptText: prompt,
        responseText: meta.rawText,
        promptTokens: meta.usage.promptTokens,
        completionTokens: meta.usage.completionTokens,
        confidenceScore: classification.confidence,
        latencyMs: Date.now() - llmStart,
        accountId,
      });
      const classifiedAt = new Date().toISOString();

      const result = await deps.findOrCreateTicketForThread(deps.db, {
        audit: classificationAudit({ verdict, ensemble, abstain, promptVersion }),
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
          to_email: headerValue(msgHeaders, "To") || null,
          body_plain,
          body_html,
          snippet,
          gmail_message_id: messageId,
          gmail_thread_id: threadId,
          received_at: receivedAt,
        },
        classifiedAt,
        classificationTier: 0,
        priorityScore: null,
      });


      await deps.linkMessageToTicket(deps.db, {
        ticket_id: result.ticket_id,
        message_id: insertedMsg.id,
        is_origin: result.was_created,
      });

      if (result.was_created) {
        ticketsCreated++;
      } else {
        await deps.applyCustomerReplyTransition(deps.db, result.ticket_id, result.prior_status);
        ticketsReopened++;
      }
      await deps.requestKnowledge?.({ accountId, ticketId: result.ticket_id, messageId: insertedMsg.id });
      const { error: completedError } = await deps.db
        .from("messages")
        .update({
          conversation_id,
          classification_status: "classified",
          ...routingAudit(filterResult.facts),
          processing_tier: 0,
          classified_at: classifiedAt,
        })
        .eq("id", insertedMsg.id);

      if (completedError) throw new Error("Message completion failed");

    } catch (err) {
      await recordClassificationFailure({
        supabase: deps.db,
        accountId,
        channelIntegrationId,
        externalId: messageId,
        threadExternalId: threadId,
        receivedAt,
        senderExternalId: from,
        senderDisplayName: null,
        subject,
        snippet,
        bodyPlain: body_plain,
        bodyHtml: body_html,
        messageIdHeader,
        processingTier: 0,
        err,
        maxAttempts: env.CLASSIFICATION_MAX_ATTEMPTS,
      });
      throw err;
    }
  }

  return { ticketsCreated, ticketsReopened, skipped, processed };
}


async function collectHistory(
  deps: GmailPollDeps,
  token: string,
  startHistoryId: string
): Promise<{ messageIds: string[]; newHistoryId: string }> {
  const messageIds = new Set<string>();
  let newHistoryId = startHistoryId;
  let page = await deps.historyList(token, startHistoryId);
  const pageTokens = new Set<string>();

  for (;;) {
    for (const record of page.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        messageIds.add(added.message.id);
      }
    }
    if (page.historyId) newHistoryId = page.historyId;

    if (!page.nextPageToken) break;
    if (pageTokens.has(page.nextPageToken)) throw new Error('Gmail history pagination did not progress');
    pageTokens.add(page.nextPageToken);
    page = await deps.historyList(token, startHistoryId, page.nextPageToken);
  }

  return { messageIds: [...messageIds], newHistoryId };
}


async function pollAccount(
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

  if (integrationErr) throw new Error('Gmail integration lookup failed');
  if (!integration) {
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
  if (!row.gmail_history_id) {
    const profile = await deps.getProfile(token);
    await persistCursor(deps, row, profile.historyId, false);

    return {
      outcome: "seeded",
      newMessages: 0,
      ticketsCreated: 0,
      ticketsReopened: 0,
      skipped: 0,
      newHistoryId: profile.historyId,
    };
  }
  const classifierContext = await deps.resolveClassifierContext("new_email", accountId);
  try {
    const { messageIds, newHistoryId } = await collectHistory(deps, token, row.gmail_history_id);

    const ingestStats = messageIds.length
      ? await ingestMessages(deps, {
          accountId,
          channelIntegrationId: row.id,
          token,
          messageIds,
          classifierContext,
        })
      : { ticketsCreated: 0, ticketsReopened: 0, skipped: 0, processed: 0 };

    await persistCursor(deps, row, newHistoryId);

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
    const profile = await deps.getProfile(token);
    const ids = new Set<string>();
    let pageToken: string | undefined;
    const pageTokens = new Set<string>();
    do {
      const page = await deps.messagesList(token, pageToken);
      for (const message of page.messages ?? []) ids.add(message.id);
      pageToken = page.nextPageToken;
      if (pageToken && pageTokens.has(pageToken)) throw new Error('Gmail inbox pagination did not progress');
      if (pageToken) pageTokens.add(pageToken);
    } while (pageToken);
    const messageIds = [...ids];

    const ingestStats = messageIds.length
      ? await ingestMessages(deps, {
          accountId,
          channelIntegrationId: row.id,
          token,
          messageIds,
          classifierContext,
        })
      : { ticketsCreated: 0, ticketsReopened: 0, skipped: 0, processed: 0 };

    await persistCursor(deps, row, profile.historyId);

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

const activePolls = new Map<string, Promise<PollAccountResult>>();

/** Coalesce overlapping callers; Inngest also serializes runs across workers. */
export function pollGmailAccount(deps: GmailPollDeps, accountId: string): Promise<PollAccountResult> {
  const active = activePolls.get(accountId);
  if (active) return active;
  const run = pollAccount(deps, accountId).finally(() => activePolls.delete(accountId));
  activePolls.set(accountId, run);
  return run;
}
