// KAI-246: acknowledgement-on-ticket-creation trigger.
//
// Called from the Gmail sync pipeline (tier1-fast-path + incremental-sync)
// immediately after a NEW ticket is persisted (was_created=true). Renders
// `acknowledgement.html` (KAI-244) and sends it via the outbox (ADR-023 §1) so
// the customer gets their `KAI-n` ticket number.
//
// Guards (in priority order, first one matching aborts the send):
//   1. Feature flag — `enable_ticket_acknowledgement`, OFF by default.
//   2. Freshness — only fire for tickets received within FRESHNESS_WINDOW_MS.
//      Prevents a backfill / re-sync from sending stale acknowledgements.
//   3. Thread / recipient — needs a gmail thread id and a parseable sender.
//
// Idempotency is implicit: this is only called when `was_created === true`,
// which the unique index in tickets-by-thread.ts guarantees happens at most
// once per conversation. Automated-sender exclusion (ADR-017) is handled
// upstream by `preFilterEmail()`, same as out-of-hours-reply.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFlag } from "@kairo/feature-flags";
import { renderAcknowledgement, buildTicketId } from "../emails/registry.js";
import { resolveEmailUrls } from "../emails/urls.js";
import { formatEmailDate } from "../emails/format.js";
import { buildKairoToken, appendKairoToken } from "./ticket-traceability.js";
import { buildPlainBody } from "./template-renderer.js";
import { linkMessageToTicket } from "./ticket-messages.js";
import { getGmailEmailByAccount } from "./gmail-token.js";
import { inngest } from "./inngest.js";

const FRESHNESS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes — mirrors out-of-hours-reply.ts

export interface MaybeSendTicketAcknowledgementArgs {
  supabase: SupabaseClient;
  accountId: string;
  ticketId: string;
  ticketNumber: number;
  conversationId: string | null;
  channelIntegrationId: string | null;
  gmailThreadId: string | null;
  subject: string;
  fromHeader: string; // Raw "From" header, e.g. '"Jane" <jane@x.com>'
  customerDisplayName: string | null;
  category: string | null; // classification.category
  receivedAt: string; // ISO timestamp
  messageIdHeader: string | null; // RFC 2822 Message-ID, for In-Reply-To
  now?: Date; // override for tests
}

export type TicketAcknowledgementOutcome =
  | { sent: true }
  | {
      sent: false;
      reason: "flag_disabled" | "stale" | "no_thread_id" | "no_recipient" | "send_failed";
    };

function extractEmail(fromHeader: string): string | null {
  const angle = /<([^>]+)>/.exec(fromHeader);
  if (angle) return angle[1].trim();
  const bare = fromHeader.trim();
  return /^[^\s@]+@[^\s@]+$/.test(bare) ? bare : null;
}

export async function maybeSendTicketAcknowledgement(
  args: MaybeSendTicketAcknowledgementArgs
): Promise<TicketAcknowledgementOutcome> {
  // Guard 1: feature flag — OFF by default.
  if (!getFlag("enable_ticket_acknowledgement")) {
    return { sent: false, reason: "flag_disabled" };
  }

  const now = args.now ?? new Date();

  // Guard 2: freshness — never acknowledge old emails (backfill protection).
  const receivedTime = new Date(args.receivedAt).getTime();
  if (Number.isNaN(receivedTime) || now.getTime() - receivedTime > FRESHNESS_WINDOW_MS) {
    return { sent: false, reason: "stale" };
  }

  if (!args.gmailThreadId) return { sent: false, reason: "no_thread_id" };

  const recipient = extractEmail(args.fromHeader);
  if (!recipient) return { sent: false, reason: "no_recipient" };

  const urls = await resolveEmailUrls({
    accountId: args.accountId,
  });

  const ticketIdHuman = buildTicketId(args.ticketNumber);
  const customerName = args.customerDisplayName ?? recipient.split("@")[0] ?? "";

  const bodyHtml = renderAcknowledgement({
    customer_name: customerName,
    ticket_id: ticketIdHuman,
    ticket_subject: args.subject,
    ...urls,
    ticket_category: args.category ?? "",
    ticket_created_at: formatEmailDate(args.receivedAt),
  });

  const kairoToken = buildKairoToken(args.ticketNumber);
  const plainBody = `Hola ${customerName},\n\nHemos recibido tu mensaje y creado el ticket ${ticketIdHuman}. Nuestro equipo lo revisará en breve.`;
  const bodyPlain = buildPlainBody({ body: plainBody, kairoToken, signaturePlain: null });

  const baseSubject = args.subject.startsWith("Re:") ? args.subject : `Re: ${args.subject}`;
  const subject = appendKairoToken(baseSubject, args.ticketNumber);

  const gmailFromEmail = await getGmailEmailByAccount(args.accountId);
  const nowIso = now.toISOString();

  const { data: outboundMsg, error: insertErr } = await args.supabase
    .from("messages")
    .insert({
      account_id: args.accountId,
      conversation_id: args.conversationId,
      channel_integration_id: args.channelIntegrationId,
      external_id: null,
      thread_external_id: args.gmailThreadId,
      direction: "outbound",
      delivery_status: "queued",
      sender_external_id: gmailFromEmail,
      sender_display_name: gmailFromEmail,
      body_plain: bodyPlain,
      body_html: bodyHtml,
      snippet: bodyPlain.slice(0, 200),
      raw_payload: {},
      received_at: nowIso,
    })
    .select("id")
    .single();

  if (insertErr || !outboundMsg) {
    console.error(
      `[ticket-acknowledgement] insert failed account=${args.accountId} ticket=${args.ticketId}: ${insertErr?.message}`
    );
    return { sent: false, reason: "send_failed" };
  }

  await linkMessageToTicket(args.supabase, {
    ticket_id: args.ticketId,
    message_id: outboundMsg.id,
    is_origin: false,
  });

  await inngest.send({
    name: "messages/outbound.queued",
    data: {
      messageId: outboundMsg.id,
      ticketId: args.ticketId,
      accountId: args.accountId,
      provider: "gmail",
      to: recipient,
      subject,
      bodyPlain,
      bodyHtml,
      threadExternalId: args.gmailThreadId,
      ...(args.messageIdHeader ? { inReplyToExternalId: args.messageIdHeader } : {}),
    },
  });

  return { sent: true };
}
