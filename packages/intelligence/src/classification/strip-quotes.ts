/**
 * Separate what a sender actually typed this time from the quoted thread
 * history a reply carries along.
 *
 * Measured on 50 real corporate emails (KAI-181): the raw body (with quotes)
 * has a median of 3,310 characters and a max of 15,303; the new text alone has
 * a median of 347 and a p90 of 1,332. The two numbers describe different
 * things — one is "how much history this thread has accumulated", the other
 * is "how much a human wrote just now" — and only the second is what a
 * classifier needs to read once per message. Feeding it the first means
 * reprocessing (and paying for) the same quoted block on every reply in a
 * thread, and a blind character cap on that raw body cuts new content and
 * quoted noise indiscriminately instead of separating them on purpose.
 */

// Ordered by how early a marker typically appears in a reply. The Outlook
// underscore/hyphen separator line is checked structurally (own line, 5+
// repeated characters) rather than as a fixed-width string, since the exact
// rule length varies by client and locale.
const INLINE_MARKERS = [
  /^>\s/m,
  /El\s[\s\S]{1,200}\sescribi[oó]:/i,
  /On\s[\s\S]{1,200}\swrote:/i,
  /^-{3,}\s*(Mensaje original|Original Message)\s*-{0,3}/im,
  /^\s*(De|From):\s*.+$/im,
];

const SEPARATOR_LINE = /^[\s]*[_-]{5,}[\s]*$/m;

/**
 * Returns the text before the first quote marker, or the whole body when no
 * marker is found — a message that opens a thread has nothing to strip.
 */
export function stripQuotedThread(body: string): string {
  let cutAt = body.length;

  const sep = SEPARATOR_LINE.exec(body);
  if (sep && sep.index < cutAt) cutAt = sep.index;

  for (const marker of INLINE_MARKERS) {
    const m = marker.exec(body);
    if (m && m.index < cutAt) cutAt = m.index;
  }

  return body.slice(0, cutAt).trimEnd();
}
