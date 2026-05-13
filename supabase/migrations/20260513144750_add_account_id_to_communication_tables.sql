-- Add account_id to communication tables
ALTER TABLE "public"."channel_integrations" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE "public"."conversations" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE "public"."messages" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

-- Create indexes
CREATE INDEX "idx_channel_integrations_account_id" ON "public"."channel_integrations"("account_id");
CREATE INDEX "idx_conversations_account_id" ON "public"."conversations"("account_id");
CREATE INDEX "idx_messages_account_id" ON "public"."messages"("account_id");
