-- ADR-022 Phase 5: Final cleanup (idempotent)
-- - Drop gmail_accounts (legacy, replaced by oauth_credentials)
-- - channel_integrations: drop user_id

DROP TABLE IF EXISTS public.gmail_accounts;

-- ─────────────────────────────────────────────────────────────────────────────
-- channel_integrations: drop user_id
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_channel_integrations_user_id;

ALTER TABLE public.channel_integrations DROP CONSTRAINT IF EXISTS channel_integrations_user_provider_account_key;
ALTER TABLE public.channel_integrations DROP CONSTRAINT IF EXISTS channel_integrations_user_id_fkey;
ALTER TABLE public.channel_integrations DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.channel_integrations DROP CONSTRAINT IF EXISTS channel_integrations_account_provider_external_key;
ALTER TABLE public.channel_integrations
  ADD CONSTRAINT channel_integrations_account_provider_external_key
  UNIQUE (account_id, provider, external_account_id);
