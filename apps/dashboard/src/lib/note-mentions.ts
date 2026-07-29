import type { NoteMention } from "@/hooks/use-ticket-thread";

// ---------------------------------------------------------------------------
// KAI-232 / ADR-025 §3 — client-side rendering of mention tokens.
//
// Note bodies persist mentions as the opaque token `@[user:<uuid>]`. The API
// resolves display names and returns them alongside the body; this module
// turns "text @[user:id] more text" into renderable segments so the UI can
// draw a chip without ever storing a name.
// ---------------------------------------------------------------------------

/** Mirrors the server-side token contract in apps/api/src/lib/note-mentions.ts. */
const MENTION_TOKEN_PATTERN = /@\[user:([0-9a-fA-F-]{36})\]/g;

export type NoteBodySegment =
  | { type: "text"; value: string }
  | { type: "mention"; userId: string; name: string | null };

/**
 * Splits a note body into text and mention segments, in order.
 * Unknown user IDs still produce a mention segment with `name: null` — the
 * caller decides how to label them (a generic "@member" chip).
 */
export function parseNoteBody(
  body: string | null,
  mentions: NoteMention[] = [],
): NoteBodySegment[] {
  if (!body) return [];

  const nameById = new Map(mentions.map((m) => [m.user_id.toLowerCase(), m.name]));
  const segments: NoteBodySegment[] = [];
  const pattern = new RegExp(MENTION_TOKEN_PATTERN.source, "g");

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    const userId = (match[1] ?? "").toLowerCase();
    segments.push({ type: "mention", userId, name: nameById.get(userId) ?? null });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ type: "text", value: body.slice(lastIndex) });
  }

  return segments;
}

/** Builds the token inserted into the composer when a member is picked. */
export function buildMentionToken(userId: string): string {
  return `@[user:${userId}]`;
}

/** User IDs mentioned in a draft, in order of first appearance (deduplicated). */
export function extractMentionUserIds(body: string): string[] {
  const pattern = new RegExp(MENTION_TOKEN_PATTERN.source, "g");
  const ids: string[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const id = (match[1] ?? "").toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

/**
 * Active `@query` immediately before the caret, or null when the caret is not
 * in a mention context. Only a run of word characters counts, so an `@` that
 * has already been turned into a token never re-opens the dropdown.
 */
export function findActiveMentionQuery(
  text: string,
  caretIndex: number,
): { query: string; start: number } | null {
  const upToCaret = text.slice(0, caretIndex);
  const match = /@(\w*)$/.exec(upToCaret);
  if (!match) return null;

  // An `@` directly preceded by a word character is an email/handle, not a
  // mention trigger ("name@domain" must not open the dropdown).
  const atIndex = caretIndex - match[0].length;
  const charBefore = atIndex > 0 ? upToCaret[atIndex - 1] : "";
  if (charBefore && /\w/.test(charBefore)) return null;

  return { query: match[1] ?? "", start: atIndex };
}

/**
 * Strips every mention token for a user from a body, collapsing the whitespace
 * the token leaves behind. Used when a mention chip is dismissed (spec C8) —
 * the chip row is a view of the text, so removing one must edit the text.
 */
export function removeMentionToken(body: string, userId: string): string {
  const token = buildMentionToken(userId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body
    .replace(new RegExp(`${token}\\s?`, "gi"), "")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * Replaces the active `@query` with a mention token, returning the new body and
 * the caret position that follows the inserted token.
 */
export function insertMentionToken(
  text: string,
  start: number,
  caretIndex: number,
  userId: string,
): { value: string; caret: number } {
  const token = `${buildMentionToken(userId)} `;
  const value = text.slice(0, start) + token + text.slice(caretIndex);
  return { value, caret: start + token.length };
}
