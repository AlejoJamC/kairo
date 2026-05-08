// KAI-40: out-of-hours auto-reply trigger.
//
// Called from the Gmail sync pipeline (tier1-fast-path + incremental-sync)
// after a new ticket is persisted. Decides whether to send a templated reply
// to the customer because the ticket arrived outside the tenant's configured
// support hours.
//
// Guards (in priority order, first one matching aborts the send):
//   1. Freshness — only fire for tickets received within FRESHNESS_WINDOW_MS.
//      Prevents a backfill / re-sync from spamming auto-replies for old emails.
//   2. Support-hours predicate — if the ticket arrived inside business hours,
//      no reply.
//   3. Thread idempotency — if any ticket on the same gmail_thread_id for this
//      user is already auto_replied_out_of_hours, no reply.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendGmailReply, GmailSendException } from "./gmail-send.js";
import {
  isWithinSupportHours,
  DEFAULT_SCHEDULE,
  type SupportScheduleEntry,
} from "./support-hours.js";
import { buildOutOfHoursReply, type Locale } from "./out-of-hours-template.js";

const FRESHNESS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export interface MaybeSendOutOfHoursReplyArgs {
  supabase: SupabaseClient;
  userId: string;
  ticketId: string;
  gmailAccessToken: string;
  gmailThreadId: string | null;
  gmailMessageId: string;
  fromHeader: string;          // Raw "From" header, e.g. '"Jane" <jane@x.com>'
  subject: string;
  receivedAt: string;          // ISO timestamp
  locale?: Locale;
  now?: Date;                  // Override for tests
}

export type OutOfHoursReplyOutcome =
  | { sent: true }
  | {
      sent: false;
      reason:
        | "stale"
        | "within_hours"
        | "already_replied"
        | "no_thread_id"
        | "no_recipient"
        | "send_failed";
    };

function extractEmail(fromHeader: string): string | null {
  const angle = /<([^>]+)>/.exec(fromHeader);
  if (angle) return angle[1].trim();
  const bare = fromHeader.trim();
  return /^[^\s@]+@[^\s@]+$/.test(bare) ? bare : null;
}

export async function maybeSendOutOfHoursReply(
  args: MaybeSendOutOfHoursReplyArgs
): Promise<OutOfHoursReplyOutcome> {
  const now = args.now ?? new Date();

  // Guard 1: freshness — never auto-reply to old emails (backfill protection).
  const receivedTime = new Date(args.receivedAt).getTime();
  if (Number.isNaN(receivedTime) || now.getTime() - receivedTime > FRESHNESS_WINDOW_MS) {
    return { sent: false, reason: "stale" };
  }

  if (!args.gmailThreadId) return { sent: false, reason: "no_thread_id" };

  const recipient = extractEmail(args.fromHeader);
  if (!recipient) return { sent: false, reason: "no_recipient" };

  // Load tenant schedule; fall back to DEFAULT_SCHEDULE when empty.
  const { data: scheduleRows } = await args.supabase
    .from("support_schedules")
    .select("day_of_week, start_time, end_time, timezone")
    .eq("user_id", args.userId);

  const schedule: ReadonlyArray<SupportScheduleEntry> =
    (scheduleRows && scheduleRows.length > 0)
      ? (scheduleRows as SupportScheduleEntry[])
      : DEFAULT_SCHEDULE;

  // Guard 2: inside support hours → no auto-reply.
  if (isWithinSupportHours(schedule, now)) {
    return { sent: false, reason: "within_hours" };
  }

  // Guard 3: thread idempotency.
  const { data: prior } = await args.supabase
    .from("tickets")
    .select("id")
    .eq("user_id", args.userId)
    .eq("gmail_thread_id", args.gmailThreadId)
    .eq("auto_replied_out_of_hours", true)
    .limit(1)
    .maybeSingle();

  if (prior) return { sent: false, reason: "already_replied" };

  const { subject, bodyPlain } = buildOutOfHoursReply({
    originalSubject: args.subject,
    locale: args.locale,
  });

  try {
    await sendGmailReply({
      accessToken: args.gmailAccessToken,
      threadId: args.gmailThreadId,
      to: recipient,
      subject,
      bodyPlain,
      inReplyToMessageId: args.gmailMessageId,
    });
  } catch (err) {
    const detail =
      err instanceof GmailSendException ? err.gmailError.code : String(err);
    console.error(
      `[out-of-hours] gmail send failed user=${args.userId} ticket=${args.ticketId}: ${detail}`
    );
    return { sent: false, reason: "send_failed" };
  }

  await args.supabase
    .from("tickets")
    .update({
      auto_replied_out_of_hours: true,
      auto_replied_at: now.toISOString(),
    })
    .eq("id", args.ticketId);

  return { sent: true };
}
