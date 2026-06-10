-- KAI-245: per-tenant overrides for transactional email footer URLs
--
-- ADR-024 §5: help_center_url, status_url, privacy_url, unsubscribe_url are
-- resolved from accounts (per-tenant) with platform-level fallback for
-- privacy_url (PRIVACY_URL env). help_center_url/status_url/unsubscribe_url
-- have no platform fallback today (no help center / status page / unsubscribe
-- flow exist) — when null, resolveEmailUrls() returns "" and the registry
-- hides the corresponding footer link via the kairo:if block syntax.
--
-- All nullable, no defaults: absence is a meaningful state ("use fallback or hide"),
-- not an error.

ALTER TABLE public.accounts
  ADD COLUMN help_center_url text,
  ADD COLUMN status_url text,
  ADD COLUMN privacy_url text,
  ADD COLUMN unsubscribe_url text;
