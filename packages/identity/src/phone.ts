import { parsePhoneNumberFromString } from 'libphonenumber-js';
export type { CountryCode } from 'libphonenumber-js';

/**
 * Result of normalizing a phone number.
 *
 * We return `{ e164, extension }` rather than a plain `string` because phone
 * numbers in Spanish-speaking markets frequently include PBX extensions
 * (e.g. `+57 1 2345678 ext 100`). Callers (workers) decide how to store each
 * field — typically `draft_contact.phone = e164` and
 * `draft_contact.metadata.phone_extension = extension`.
 */
export interface NormalizedPhone {
  /** Phone number in E.164 format, e.g. "+573001234567". */
  e164: string;
  /**
   * PBX extension if present, e.g. "100". Null when no extension was found.
   * This is NOT part of the E.164 string.
   */
  extension: string | null;
}

/**
 * Normalizes a raw phone string to E.164 format, extracting any PBX extension.
 *
 * Uses `libphonenumber-js` for parsing and validation.
 *
 * - null / empty → null
 * - Invalid or un-parseable number → null
 * - Valid number → `{ e164: "+XXXXXXXXXXX", extension: "NNN" | null }`
 *
 * @param raw - Raw phone string as received from the user (may include country
 *   code prefix, spaces, dashes, parentheses, or "ext NNN" suffixes).
 * @param defaultCountry - ISO 3166-1 alpha-2 country code used when `raw` does
 *   not include an international prefix (e.g. "CO" for Colombia, "ES" for Spain).
 *
 * @example
 * normalizePhone("300 123 4567", "CO")
 * // → { e164: "+573001234567", extension: null }
 *
 * normalizePhone("+57 1 2345678 ext 100", "CO")
 * // → { e164: "+5712345678", extension: "100" }
 *
 * normalizePhone("123", "CO")
 * // → null
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry: import('libphonenumber-js').CountryCode,
): NormalizedPhone | null {
  if (raw == null || raw.trim() === '') return null;

  const trimmed = raw.trim();

  // Extract extension suffix before passing to the parser.
  // Accepts formats: "ext 100", "ext. 100", "x100", "#100", "extn 100"
  const extPattern = /\s*(?:ext\.?|x|#|extn\.?)\s*(\d+)\s*$/i;
  const extMatch = extPattern.exec(trimmed);
  const extension = extMatch ? extMatch[1] ?? null : null;
  const phoneRaw = extMatch ? trimmed.slice(0, extMatch.index) : trimmed;

  const parsed = parsePhoneNumberFromString(phoneRaw, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;

  return { e164: parsed.format('E.164'), extension };
}
