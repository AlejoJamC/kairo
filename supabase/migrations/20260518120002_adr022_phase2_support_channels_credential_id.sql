-- ADR-022 Phase 2: Refactor support_channels to point at oauth_credentials
-- - Add credential_id FK (nullable: channel survives revoked credentials)
-- - Rename connected_by → connected_by_user_id (audit semantics only)
-- - Backfill credential_id from oauth_credentials by (account_id, provider, email)

-- 1. Add credential_id column
ALTER TABLE public.support_channels
  ADD COLUMN credential_id uuid REFERENCES public.oauth_credentials(id) ON DELETE SET NULL;

CREATE INDEX idx_support_channels_credential_id
  ON public.support_channels (credential_id);

-- 2. Rename connected_by → connected_by_user_id
--    (was already NULLABLE with ON DELETE SET NULL — just semantic rename)
ALTER TABLE public.support_channels
  RENAME COLUMN connected_by TO connected_by_user_id;

-- 3. Backfill credential_id: match by (account_id, channel_type=provider, email_address=external_account_id)
UPDATE public.support_channels sc
SET credential_id = oc.id
FROM public.oauth_credentials oc
WHERE oc.account_id          = sc.account_id
  AND oc.provider            = sc.channel_type
  AND oc.external_account_id = sc.email_address;

-- ---------------------------------------------------------------------------
-- Validation: must return 0 for active Gmail channels (or only known revoked ones).
-- SELECT COUNT(*) FROM support_channels sc
-- WHERE sc.is_active = true
--   AND sc.credential_id IS NULL
--   AND sc.channel_type IN ('gmail');
-- ---------------------------------------------------------------------------
