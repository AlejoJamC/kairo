import { supabase } from "./supabase.js";
import { extractMentionUserIds, renderMentionsAsPlainText } from "./note-mentions.js";

// ---------------------------------------------------------------------------
// Mention fan-out for internal notes — KAI-232 / ADR-025 §4
//
// After a note is written, mentioned teammates get a `ticket_note_mentions`
// row and an in-app `notifications` row (kind='mention'). In-app only: no
// email, no push, no Twilio (explicit product decision in KAI-232).
//
// The whole fan-out is NON-FATAL — same contract as `emitTicketEvent`: a
// notification failure must never fail the note the agent just wrote.
// ---------------------------------------------------------------------------

/** Chars of the note body embedded in the notification excerpt. */
const EXCERPT_MAX_CHARS = 140;

export interface ResolvedMention {
  user_id: string;
  name: string | null;
  /**
   * True when this mention points at the caller. Resolved server-side so the
   * client can render "you were tagged" (a solid accent chip) without knowing
   * anything about identity — the API stays the single resolver (ADR-025 §3).
   */
  is_me?: boolean;
}

export interface FanOutMentionsOptions {
  accountId: string;
  ticketId: string;
  ticketEventId: string;
  authorId: string;
  body: string;
}

/**
 * Resolves display names for a set of user IDs from `profiles`.
 * Falls back to the email, then to null — never throws.
 */
export async function resolveMentionNames(
  userIds: string[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  if (userIds.length === 0) return names;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", userIds);

  if (error) {
    console.error("[note-mentions] name resolution failed", { error: error.message });
    return names;
  }

  for (const row of (data ?? []) as { id: string; name: string | null; email: string | null }[]) {
    names.set(row.id, row.name ?? row.email ?? null);
  }

  return names;
}

/**
 * Parses mention tokens from a note body and returns only those pointing at an
 * ACTIVE member of the given account. Client-sent IDs are never trusted:
 * non-members (and members of other accounts) are silently dropped.
 */
export async function resolveValidMentions(
  body: string,
  accountId: string,
): Promise<ResolvedMention[]> {
  const candidateIds = extractMentionUserIds(body);
  if (candidateIds.length === 0) return [];

  const { data: memberRows, error } = await supabase
    .from("account_members")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("status", "active")
    .in("user_id", candidateIds);

  if (error) {
    console.error("[note-mentions] member validation failed", { error: error.message });
    return [];
  }

  const activeIds = new Set(
    ((memberRows ?? []) as { user_id: string }[]).map((r) => r.user_id),
  );
  const validIds = candidateIds.filter((id) => activeIds.has(id));
  if (validIds.length === 0) return [];

  const names = await resolveMentionNames(validIds);

  return validIds.map((user_id) => ({ user_id, name: names.get(user_id) ?? null }));
}

/**
 * Attaches `is_me` to already-resolved mentions, relative to the caller.
 */
export function markOwnMentions(
  mentions: ResolvedMention[],
  callerUserId: string,
): ResolvedMention[] {
  return mentions.map((m) => ({ ...m, is_me: m.user_id === callerUserId }));
}

/**
 * Writes mention + notification rows for every valid mention in a note.
 *
 * Returns ALL valid mentions — including a self-mention — so the caller can
 * echo them in the response and the UI can render every token as a chip.
 * Only the *recipients* exclude the author: nobody is notified of their own
 * note. Never throws: every failure is logged and swallowed.
 */
export async function fanOutNoteMentions(
  opts: FanOutMentionsOptions,
): Promise<ResolvedMention[]> {
  try {
    const mentions = await resolveValidMentions(opts.body, opts.accountId);
    if (mentions.length === 0) return [];

    const nameMap = new Map(mentions.map((m) => [m.user_id, m.name]));

    const recipients = mentions.filter((m) => m.user_id !== opts.authorId);
    if (recipients.length === 0) return mentions;

    const authorName = (await resolveMentionNames([opts.authorId])).get(opts.authorId);

    // Excerpt shows @Name instead of the raw token, and never leaks a
    // customer-facing surface: notifications are internal-only.
    const plainBody = renderMentionsAsPlainText(opts.body, nameMap);
    const excerpt =
      plainBody.length > EXCERPT_MAX_CHARS
        ? `${plainBody.slice(0, EXCERPT_MAX_CHARS)}…`
        : plainBody;

    // `title` carries ONLY the author's display name — the sentence ("X
    // mentioned you in KAI-T-1247") is composed client-side from the i18n
    // catalog plus the ticket's short_id, so mention notifications are
    // properly localized instead of server-rendered Spanish (the debt KAI-168
    // left behind for `sla_escalation`).
    const title = authorName ?? "";

    // Notifications first: `notified_at` is only stamped when delivery landed.
    const { error: notifErr } = await supabase.from("notifications").insert(
      recipients.map((m) => ({
        account_id: opts.accountId,
        recipient_user_id: m.user_id,
        kind: "mention",
        ticket_id: opts.ticketId,
        ticket_event_id: opts.ticketEventId,
        title,
        body: excerpt,
      })),
    );

    if (notifErr) {
      console.error("[note-mentions] notification insert failed", {
        ticketEventId: opts.ticketEventId,
        error: notifErr.message,
      });
    }

    const notifiedAt = notifErr ? null : new Date().toISOString();

    const { error: mentionErr } = await supabase.from("ticket_note_mentions").insert(
      recipients.map((m) => ({
        account_id: opts.accountId,
        ticket_id: opts.ticketId,
        ticket_event_id: opts.ticketEventId,
        mentioned_user_id: m.user_id,
        notified_at: notifiedAt,
      })),
    );

    if (mentionErr) {
      console.error("[note-mentions] mention insert failed", {
        ticketEventId: opts.ticketEventId,
        error: mentionErr.message,
      });
    }

    return mentions;
  } catch (err) {
    // Non-fatal by contract — the note write already succeeded.
    console.error("[note-mentions] fan-out failed", {
      ticketEventId: opts.ticketEventId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
