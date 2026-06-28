/**
 * Ticket traceability helpers — KAI-115 / ADR-023 §3
 *
 * [KAIRO-<ticket_number>] tokens are injected into every outbound email
 * (subject + body footer). The number is the human-visible ticket number
 * (`tickets.ticket_number`, shown in the UI as `KAI-T-453`) — NOT the UUID
 * fragment — so the token a customer sees matches the ticket the agent sees.
 *
 * When an email client breaks the Gmail thread, the ingestion pipeline extracts
 * the token from the incoming subject and re-associates the message to the
 * original ticket instead of creating a duplicate.
 *
 * Pure logic — no supabase/inngest imports beyond the typed client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/** Build the stable [KAIRO-<ticket_number>] token for subjects and body footers. */
export function buildKairoToken(ticketNumber: number): string {
  return `[KAIRO-${ticketNumber}]`;
}

/**
 * Append the [KAIRO-<ticket_number>] token to a reply subject.
 * Already-tagged subjects are returned unchanged to avoid doubling.
 */
export function appendKairoToken(subject: string, ticketNumber: number): string {
  const token = buildKairoToken(ticketNumber);
  return subject.includes(token) ? subject : `${subject} ${token}`;
}

/** Extract the ticket_number from a [KAIRO-<ticket_number>] token, or return null. */
export function extractKairoToken(subject: string): number | null {
  const match = subject.match(/\[KAIRO-(\d+)\]/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Extract the ticket_number from the LAST [KAIRO-<ticket_number>] token in a
 * subject, or return null. Subjects can accumulate multiple tokens across a
 * long reply chain (e.g. a customer replying to an old quoted email whose
 * subject still carries a stale token) — the last occurrence is the one
 * appended most recently by Kairo and therefore reflects the ticket that is
 * actually current. Used by the gmail-poll ingestion worker (KAI-248 Grupo 1)
 * for broken-thread re-association.
 */
export function extractLastKairoToken(subject: string): number | null {
  const matches = [...subject.matchAll(/\[KAIRO-(\d+)\]/gi)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  const n = Number(last);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Look up a ticket by (accountId, ticketNumber).
 * Returns `{ ticketId, conversationId }` when found, or null.
 * Used in the ingestion pipeline for broken-thread re-association.
 */
export async function findTicketByKairoToken(
  client: DbClient,
  accountId: string,
  ticketNumber: number,
): Promise<{ ticketId: string; conversationId: string | null } | null> {
  const { data } = await client
    .from("tickets")
    .select("id, conversation_id")
    .eq("account_id", accountId)
    .eq("ticket_number", ticketNumber)
    .is("merged_into_ticket_id", null)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { ticketId: data.id, conversationId: data.conversation_id ?? null };
}
