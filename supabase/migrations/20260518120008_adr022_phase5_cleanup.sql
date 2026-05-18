-- ADR-022 Phase 5: Final cleanup
-- - Drop gmail_accounts (legacy, replaced by oauth_credentials)
-- - channel_integrations: drop user_id (leaking_nivel4, absorbed by oauth_credentials)

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate before drop: no active readers should reference gmail_accounts at
-- this point. The following query must return 0 in production before applying:
--
--   SELECT COUNT(*) FROM public.gmail_accounts;
--   -- If non-zero, verify oauth_credentials backfill is complete first.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.gmail_accounts;

-- ─────────────────────────────────────────────────────────────────────────────
-- channel_integrations: drop user_id (leaking nivel 4, absorbed into
-- oauth_credentials). The table itself stays for now — its drop requires
-- validating that no active data exists (see inventory).
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_channel_integrations_user_id;

ALTER TABLE public.channel_integrations
  DROP CONSTRAINT IF EXISTS channel_integrations_user_provider_account_key;

ALTER TABLE public.channel_integrations
  DROP CONSTRAINT IF EXISTS channel_integrations_user_id_fkey;

ALTER TABLE public.channel_integrations
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.channel_integrations
  ADD CONSTRAINT channel_integrations_account_provider_external_key
  UNIQUE (account_id, provider, external_account_id);
