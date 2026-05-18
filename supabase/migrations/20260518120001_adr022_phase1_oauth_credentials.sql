-- ADR-022 Phase 1: Create oauth_credentials table
-- Single canonical layer for OAuth tokens (Level 4 of ownership hierarchy).
-- gmail_accounts remains active (dual-write) until Phase 5 cleanup.

CREATE TABLE IF NOT EXISTS public.oauth_credentials (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider              text        NOT NULL CHECK (provider IN ('gmail', 'instagram', 'slack', 'whatsapp')),
  granted_by_user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  external_account_id   text        NOT NULL,
  access_token_enc      text,
  refresh_token_enc     text,
  expires_at            timestamptz,
  scope                 text,
  metadata              jsonb       DEFAULT '{}'::jsonb,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (account_id, provider, external_account_id)
);

-- Indexes
CREATE INDEX idx_oauth_credentials_account_provider
  ON public.oauth_credentials (account_id, provider);

CREATE INDEX idx_oauth_credentials_granted_by
  ON public.oauth_credentials (granted_by_user_id);

CREATE INDEX idx_oauth_credentials_expires_at
  ON public.oauth_credentials (expires_at);

-- updated_at trigger (reuse existing handle_updated_at function)
CREATE TRIGGER on_oauth_credentials_updated
  BEFORE UPDATE ON public.oauth_credentials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.oauth_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oauth_credentials_access_by_account"
  ON public.oauth_credentials
  USING (account_id = public.current_account_id());

-- Grants
GRANT ALL ON TABLE public.oauth_credentials TO anon;
GRANT ALL ON TABLE public.oauth_credentials TO authenticated;
GRANT ALL ON TABLE public.oauth_credentials TO service_role;

-- ---------------------------------------------------------------------------
-- Backfill from gmail_accounts
-- One row per gmail_accounts row → one oauth_credentials row with provider='gmail'.
-- ON CONFLICT is a safety net; in a fresh env there are no rows to conflict with.
-- ---------------------------------------------------------------------------
INSERT INTO public.oauth_credentials (
  account_id,
  provider,
  granted_by_user_id,
  external_account_id,
  access_token_enc,
  refresh_token_enc,
  expires_at,
  created_at,
  updated_at
)
SELECT
  ga.account_id,
  'gmail'          AS provider,
  ga.user_id       AS granted_by_user_id,
  ga.email         AS external_account_id,
  ga.access_token  AS access_token_enc,
  ga.refresh_token AS refresh_token_enc,
  ga.expires_at,
  ga.created_at,
  ga.updated_at
FROM public.gmail_accounts ga
ON CONFLICT (account_id, provider, external_account_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Validation: the following query must return 0 after running this migration.
-- SELECT COUNT(*) FROM public.gmail_accounts ga
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.oauth_credentials oc
--   WHERE oc.account_id          = ga.account_id
--     AND oc.provider            = 'gmail'
--     AND oc.granted_by_user_id  = ga.user_id
-- );
-- ---------------------------------------------------------------------------
