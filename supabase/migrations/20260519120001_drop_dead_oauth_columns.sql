-- Drop dead columns left over from ADR-022 migration
-- support_channels.oauth_tokens: tokens moved to oauth_credentials, column never read post-ADR-022
-- channel_integrations.credentials_encrypted: tokens moved to oauth_credentials, column never written post-ADR-022

ALTER TABLE public.support_channels       DROP COLUMN IF EXISTS oauth_tokens;
ALTER TABLE public.channel_integrations   DROP COLUMN IF EXISTS credentials_encrypted;
