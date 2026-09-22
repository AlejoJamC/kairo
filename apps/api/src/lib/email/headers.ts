// ---------------------------------------------------------------------------
// KAI-45 — one reading of a Gmail header list.
//
// `headerValue` and `headersToRecord` existed as five byte-identical copies:
// tier1-fast-path, tier2-background, tier3-deferred, incremental-sync and
// gmail-poll/poll-account. So did the `GmailHeader` shape they take. Nothing
// distinguished them, and every copy silently depended on the same detail —
// that `headersToRecord` preserves the header's original case and
// `preFilterEmail` lowercases the keys itself (pre-filter.ts, normalizeHeaders).
//
// A header lookup is the first thing the deterministic layer does with a
// message, so it is the first thing that has to have a single definition.
// ---------------------------------------------------------------------------

/** One `name: value` pair as Gmail's API returns it in `payload.headers`. */
export interface GmailHeader {
  name: string;
  value: string;
}

/**
 * The value of `name`, matched case-insensitively as RFC 5322 requires.
 *
 * Returns `""` rather than undefined: every call site treats a missing header
 * as an empty string, and the callers that care about the difference check the
 * record from {@link headersToRecord} for key presence instead.
 */
export function headerValue(headers: GmailHeader[], name: string): string {
  const wanted = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === wanted)?.value ?? "";
}

/**
 * The header list as a record, keys in their original case.
 *
 * Consumers that match on a header name are expected to lowercase the keys
 * themselves — `preFilterEmail` does, and so does `extractMailFacts`. Keeping
 * the original case here means the record can still be persisted or logged as
 * the message actually carried it.
 *
 * A repeated header (`Received`, `DKIM-Signature`) collapses to its last
 * occurrence. No caller reads one today; the ones that would need every copy
 * should walk the array instead.
 */
export function headersToRecord(headers: GmailHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { name, value } of headers) out[name] = value;
  return out;
}
