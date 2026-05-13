-- Add account_id to tables
ALTER TABLE "public"."clients" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE "public"."tenant_priority_config" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE "public"."tenant_sla_rules" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE "public"."support_schedules" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE "public"."gmail_accounts" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE "public"."tickets" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE "public"."kb_articles" ADD COLUMN "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

-- Create indexes for account_id to optimize RLS and queries
CREATE INDEX "idx_clients_account_id" ON "public"."clients"("account_id");
CREATE INDEX "idx_tenant_priority_config_account_id" ON "public"."tenant_priority_config"("account_id");
CREATE INDEX "idx_tenant_sla_rules_account_id" ON "public"."tenant_sla_rules"("account_id");
CREATE INDEX "idx_support_schedules_account_id" ON "public"."support_schedules"("account_id");
CREATE INDEX "idx_gmail_accounts_account_id" ON "public"."gmail_accounts"("account_id");
CREATE INDEX "idx_tickets_account_id" ON "public"."tickets"("account_id");
CREATE INDEX "idx_kb_articles_account_id" ON "public"."kb_articles"("account_id");
