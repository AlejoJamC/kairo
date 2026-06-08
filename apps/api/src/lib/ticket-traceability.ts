/**
 * Ticket traceability helpers — KAI-115 / ADR-023 §3
 *
 * [KAIRO-<shortid>] tokens are injected into every outbound email (subject +
 * body footer). When an email client breaks the Gmail thread, the ingestion
 * pipeline extracts the token from the incoming subject and re-associates the
 * message to the original ticket instead of creating a duplicate.
 *
 * Pure logic — no supabase/inngest imports, fully unit-testable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/** Derive the short_id from a ticket UUID (first 8 hex chars, same as DB generated column). */
export function ticketShortId(ticketId: string): string {
  return ticketId.substring(0, 8);
}

/** Build the stable [KAIRO-<shortid>] token appended to subject lines and body footers. */
export function buildKairoToken(shortId: string): string {
  return `[KAIRO-${shortId}]`;
}

/**
 * Append the [KAIRO-<shortid>] token to a reply subject.
 * Already-tagged subjects are returned unchanged to avoid doubling.
 */
export function appendKairoToken(subject: string, shortId: string): string {
  const token = buildKairoToken(shortId);
  return subject.includes(token) ? subject : `${subject} ${token}`;
}

/** Extract the short_id from a [KAIRO-<shortid>] token in a subject line, or return null. */
export function extractKairoToken(subject: string): string | null {
  const match = subject.match(/\[KAIRO-([0-9a-f]{8})\]/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Look up a ticket by (accountId, shortId).
 * Returns `{ ticketId, conversationId }` when found, or null.
 * Used in the ingestion pipeline for broken-thread re-association.
 */
export async function findTicketByKairoToken(
  client: DbClient,
  accountId: string,
  shortId: string,
): Promise<{ ticketId: string; conversationId: string | null } | null> {
  const { data } = await client
    .from("tickets")
    .select("id, conversation_id")
    .eq("account_id", accountId)
    .eq("short_id", shortId)
    .is("merged_into_ticket_id", null)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { ticketId: data.id, conversationId: data.conversation_id ?? null };
}
