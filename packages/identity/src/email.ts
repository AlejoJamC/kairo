import addrs from 'email-addresses';

/**
 * Parsed representation of an RFC 2822 email header value.
 *
 * @example
 * parseEmailHeader('"Johan Hurtado" <j@example.com>')
 * // → { name: "Johan Hurtado", email: "j@example.com" }
 *
 * parseEmailHeader('j@example.com')
 * // → { name: null, email: "j@example.com" }
 */
export interface ParsedEmailHeader {
  /** Display name when present (e.g. "Johan Hurtado"), null otherwise. */
  name: string | null;
  /** Normalized address part (already lowercased). */
  email: string;
}

/**
 * Simple regex that covers the vast majority of valid email addresses without
 * implementing full RFC 5321 complexity. Rejects obvious non-emails such as
 * plain words or addresses missing TLDs.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes a raw email string to a canonical lowercase form.
 *
 * - null / empty string → null
 * - RFC 2822 header like `"Foo Bar" <a@b.com>` → extracts the address part first
 * - Lowercases and trims
 * - Does NOT collapse `foo+tag@bar.com` to `foo@bar.com` (alias tags are preserved)
 * - Returns null if the result does not look like a valid email
 *
 * @example
 * normalizeEmail('FOO+TAG@BAR.COM') // → 'foo+tag@bar.com'
 * normalizeEmail('"Foo" <A@B.com>') // → 'a@b.com'
 * normalizeEmail('not-an-email')    // → null
 * normalizeEmail(null)              // → null
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === '') return null;

  const trimmed = raw.trim();

  // If the raw value contains angle brackets it might be an RFC 2822 header.
  // Try to parse it and extract only the address portion.
  let candidate: string;
  if (trimmed.includes('<') || trimmed.includes('"')) {
    try {
      const parsed = parseEmailHeader(trimmed);
      candidate = parsed.email;
    } catch {
      candidate = trimmed;
    }
  } else {
    candidate = trimmed;
  }

  const lower = candidate.toLowerCase().trim();
  if (!EMAIL_REGEX.test(lower)) return null;
  return lower;
}

/**
 * Parses an RFC 2822 / RFC 5322 formatted email header value into its
 * display name and address parts.
 *
 * Falls back to treating the input as a plain email address when the parser
 * cannot find a structured header.
 *
 * @throws {Error} only when the input is completely unparseable as an email —
 *   callers should catch when operating on untrusted input.
 *
 * @example
 * parseEmailHeader('"Johan Hurtado" <j@example.com>')
 * // → { name: "Johan Hurtado", email: "j@example.com" }
 */
export function parseEmailHeader(raw: string): ParsedEmailHeader {
  // email-addresses parses a full header line, returning one address per entry.
  const result = addrs.parseAddressList(raw);

  if (result && result.length > 0) {
    const first = result[0];
    if (first && first.type === 'mailbox') {
      // email-addresses returns flat objects: { name, address, local, domain, ... }
      const addrStr = (first.address as string).toLowerCase();
      const displayName =
        first.name && (first.name as string).trim() !== ''
          ? (first.name as string).trim()
          : null;
      return { name: displayName, email: addrStr };
    }
    if (first && first.type === 'group') {
      // A group mailbox — pick the first address inside the group
      const groupAddresses = (first as unknown as { addresses: Array<{ name: string | null; address: string }> }).addresses;
      const mb = groupAddresses?.[0];
      if (mb) {
        const addrStr = (mb.address as string).toLowerCase();
        const displayName =
          mb.name && mb.name.trim() !== '' ? mb.name.trim() : null;
        return { name: displayName, email: addrStr };
      }
    }
  }

  // Fall back: treat the whole string as a plain email address.
  const lower = raw.trim().toLowerCase();
  if (EMAIL_REGEX.test(lower)) {
    return { name: null, email: lower };
  }

  throw new Error(`Cannot parse email header: ${raw}`);
}
