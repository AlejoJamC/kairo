// ---------------------------------------------------------------------------
// Internal-note mentions — KAI-232 / ADR-025 §3
//
// A mention is persisted inside the note body as an opaque token carrying the
// mentioned user's ID, never their display name: names change, IDs do not.
// The API is the single resolver — it turns tokens into `{ user_id, name }`
// pairs on read, and the client renders them as chips.
//
//   stored body:  "ping @[user:6f1c...-...] can you check this?"
//   API response: mentions: [{ user_id: "6f1c...", name: "Diana" }]
// ---------------------------------------------------------------------------

/**
 * Matches a mention token `@[user:<uuid>]`.
 * The character class is intentionally narrow (lowercase hex + dashes) so that
 * arbitrary bracketed text in a note body cannot be mistaken for a mention;
 * candidates are still shape-validated below.
 */
export const MENTION_TOKEN_REGEX = /@\[user:([0-9a-fA-F-]{36})\]/g;

/** Canonical UUID shape — guards against `------...` style false positives. */
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Extracts the unique user IDs mentioned in a note body, in order of first
 * appearance. Callers MUST still verify each ID is an active member of the
 * account — this function only parses, it does not authorize.
 */
export function extractMentionUserIds(body: string): string[] {
  if (!body) return [];

  const ids: string[] = [];
  const seen = new Set<string>();

  // `matchAll` on a /g regex needs a fresh lastIndex; a literal is re-created
  // per call, but this module exports the regex, so clone it defensively.
  for (const match of body.matchAll(new RegExp(MENTION_TOKEN_REGEX.source, "g"))) {
    const raw = match[1];
    if (!raw) continue;
    const id = raw.toLowerCase();
    if (!UUID_REGEX.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

/** Builds the token a client should insert when a member is picked. */
export function buildMentionToken(userId: string): string {
  return `@[user:${userId}]`;
}

/**
 * Renders a note body as plain text for surfaces that cannot show chips
 * (notification excerpts, snippets): tokens become `@Name`, or `@member` when
 * the ID cannot be resolved.
 */
export function renderMentionsAsPlainText(
  body: string,
  names: Map<string, string | null>,
): string {
  return body.replace(new RegExp(MENTION_TOKEN_REGEX.source, "g"), (_full, rawId: string) => {
    const name = names.get(String(rawId).toLowerCase());
    return name ? `@${name}` : "@member";
  });
}
