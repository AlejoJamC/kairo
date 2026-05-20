export { normalizeEmail, parseEmailHeader } from './email.js';
export type { ParsedEmailHeader } from './email.js';

export { normalizePhone } from './phone.js';
export type { CountryCode } from 'libphonenumber-js';
export type { NormalizedPhone } from './phone.js';

export { inferOrganizationFromEmail, GENERIC_EMAIL_PROVIDERS } from './organization.js';

export { findExistingDraft, detectWeakMatches } from './dedup.js';
export type { DraftContact, DedupCandidate, WeakMatchCandidate } from './dedup.js';
