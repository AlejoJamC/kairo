-- KAI-248: Ingesta entrante en tiempo casi-real (orquestador propio: cron + Gmail history.list)
--
-- Adds the Gmail History API cursor column to channel_integrations. Nullable —
-- a NULL value means "no cursor seeded yet" and signals the new poll worker to
-- seed it via users.getProfile instead of attempting an incremental history.list.

ALTER TABLE "public"."channel_integrations"
  ADD COLUMN IF NOT EXISTS "gmail_history_id" "text";

COMMENT ON COLUMN "public"."channel_integrations"."gmail_history_id" IS
  'Gmail History API cursor (historyId) for incremental polling (KAI-248). NULL until seeded via users.getProfile on first poll for the account.';
