-- Create current_account_id helper function
CREATE OR REPLACE FUNCTION "public"."current_account_id"()
RETURNS uuid AS $$
  SELECT account_id FROM "public"."account_members"
  WHERE "user_id" = auth.uid()
    AND "status" = 'active'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Update policies to use current_account_id()
-- This ensures that the user only sees data for their "active" account.

-- Clients
DROP POLICY IF EXISTS "clients_access_by_account" ON "public"."clients";
CREATE POLICY "clients_access_by_account" ON "public"."clients"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- Tenant Priority Config
DROP POLICY IF EXISTS "tenant_priority_config_access_by_account" ON "public"."tenant_priority_config";
CREATE POLICY "tenant_priority_config_access_by_account" ON "public"."tenant_priority_config"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- Tenant SLA Rules
DROP POLICY IF EXISTS "tenant_sla_rules_access_by_account" ON "public"."tenant_sla_rules";
CREATE POLICY "tenant_sla_rules_access_by_account" ON "public"."tenant_sla_rules"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- Support Schedules
DROP POLICY IF EXISTS "support_schedules_access_by_account" ON "public"."support_schedules";
CREATE POLICY "support_schedules_access_by_account" ON "public"."support_schedules"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- Gmail Accounts
DROP POLICY IF EXISTS "gmail_accounts_access_by_account" ON "public"."gmail_accounts";
CREATE POLICY "gmail_accounts_access_by_account" ON "public"."gmail_accounts"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- Tickets
DROP POLICY IF EXISTS "tickets_access_by_account" ON "public"."tickets";
CREATE POLICY "tickets_access_by_account" ON "public"."tickets"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- KB Articles
DROP POLICY IF EXISTS "kb_articles_access_by_account" ON "public"."kb_articles";
CREATE POLICY "kb_articles_access_by_account" ON "public"."kb_articles"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- Channel Integrations
DROP POLICY IF EXISTS "channel_integrations_access_by_account" ON "public"."channel_integrations";
CREATE POLICY "channel_integrations_access_by_account" ON "public"."channel_integrations"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- Conversations
DROP POLICY IF EXISTS "conversations_access_by_account" ON "public"."conversations";
CREATE POLICY "conversations_access_by_account" ON "public"."conversations"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- Messages
DROP POLICY IF EXISTS "messages_access_by_account" ON "public"."messages";
CREATE POLICY "messages_access_by_account" ON "public"."messages"
    FOR ALL USING ("account_id" = "public"."current_account_id"());
