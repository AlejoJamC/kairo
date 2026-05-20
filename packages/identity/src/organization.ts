/**
 * Set of well-known generic / free email providers.
 *
 * When a contact's email domain belongs to this set, it carries no company
 * signal — `inferOrganizationFromEmail` returns null for these addresses.
 *
 * Extend this list as new major providers become relevant.
 */
export const GENERIC_EMAIL_PROVIDERS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.es',
  'yahoo.com.mx',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'aol.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'fastmail.com',
]);

/**
 * Infers a company / organization name from a corporate email address.
 *
 * - If the email has no `@`, returns null.
 * - If the domain belongs to a well-known free provider (`GENERIC_EMAIL_PROVIDERS`), returns null.
 * - Otherwise, takes the first segment of the domain (split by `.`) and capitalizes it.
 *
 * @example
 * inferOrganizationFromEmail('alguien@disfarma.com.co') // → "Disfarma"
 * inferOrganizationFromEmail('alguien@gmail.com')       // → null
 * inferOrganizationFromEmail('no-at-sign')              // → null
 */
export function inferOrganizationFromEmail(email: string): string | null {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return null;

  const domain = email.slice(atIndex + 1).toLowerCase();
  if (GENERIC_EMAIL_PROVIDERS.has(domain)) return null;

  // Take the first label of the domain: "disfarma.com.co" → "disfarma"
  const firstSegment = domain.split('.')[0];
  if (!firstSegment) return null;

  // Capitalize: "disfarma" → "Disfarma"
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}
