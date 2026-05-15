-- =============================================================================
-- KAI-173: support_channels — support emails as account channels, not users
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create support_channels table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."support_channels" (
    "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "account_id"    uuid NOT NULL REFERENCES "public"."accounts"("id") ON DELETE CASCADE,
    "channel_type"  text NOT NULL CHECK ("channel_type" IN ('gmail', 'outlook', 'imap', 'custom')),
    "email_address" text NOT NULL,
    "display_name"  text,
    "is_primary"    boolean NOT NULL DEFAULT false,
    "oauth_tokens"  jsonb,          -- provider tokens; NULL for non-OAuth channels
    "connected_by"  uuid REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    "connected_at"  timestamptz DEFAULT now(),
    "is_active"     boolean NOT NULL DEFAULT true,
    "created_at"    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "support_channels_account_email_unique" UNIQUE ("account_id", "email_address")
);

CREATE INDEX "idx_support_channels_account_id" ON "public"."support_channels"("account_id");
CREATE INDEX "idx_support_channels_is_active"  ON "public"."support_channels"("account_id", "is_active");

-- RLS
ALTER TABLE "public"."support_channels" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_channels_access_by_account" ON "public"."support_channels"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- -----------------------------------------------------------------------------
-- 2. Backfill: create one support_channel per existing gmail_account
--    (idempotent via ON CONFLICT DO NOTHING)
-- -----------------------------------------------------------------------------
INSERT INTO "public"."support_channels"
    ("account_id", "channel_type", "email_address", "oauth_tokens",
     "connected_by", "connected_at", "is_primary", "is_active")
SELECT
    ga."account_id",
    'gmail',
    ga."email",
    jsonb_build_object(
        'access_token',  ga."access_token",
        'refresh_token', ga."refresh_token",
        'expires_at',    ga."expires_at"
    ),
    ga."user_id",
    COALESCE(ga."created_at", now()),
    true,   -- first channel is primary by default
    true
FROM "public"."gmail_accounts" ga
WHERE ga."account_id" IS NOT NULL
ON CONFLICT ("account_id", "email_address") DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Deprecate profiles.gmail_connected
--    The field is removed; channel connection state is derived from support_channels.
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."profiles" DROP COLUMN IF EXISTS "gmail_connected";
