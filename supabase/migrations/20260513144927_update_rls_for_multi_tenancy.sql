-- Helper function to check account membership
CREATE OR REPLACE FUNCTION "public"."has_account_access"("p_account_id" uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "public"."account_members"
        WHERE "account_id" = p_account_id
        AND "user_id" = auth.uid()
        AND "status" = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS for clients
DROP POLICY IF EXISTS "clients_select_own" ON "public"."clients";
DROP POLICY IF EXISTS "clients_insert_own" ON "public"."clients";
DROP POLICY IF EXISTS "clients_update_own" ON "public"."clients";
DROP POLICY IF EXISTS "clients_delete_own" ON "public"."clients";

CREATE POLICY "clients_access_by_account" ON "public"."clients"
    FOR ALL USING ("public"."has_account_access"("account_id"));

-- Update RLS for tenant_priority_config
DROP POLICY IF EXISTS "tenant_priority_config_owner" ON "public"."tenant_priority_config";
CREATE POLICY "tenant_priority_config_access_by_account" ON "public"."tenant_priority_config"
    FOR ALL USING ("public"."has_account_access"("account_id"));

-- Update RLS for tenant_sla_rules
DROP POLICY IF EXISTS "tenant_sla_rules_owner" ON "public"."tenant_sla_rules";
CREATE POLICY "tenant_sla_rules_access_by_account" ON "public"."tenant_sla_rules"
    FOR ALL USING ("public"."has_account_access"("account_id"));

-- Update RLS for support_schedules
DROP POLICY IF EXISTS "Users CRUD own support_schedules" ON "public"."support_schedules";
CREATE POLICY "support_schedules_access_by_account" ON "public"."support_schedules"
    FOR ALL USING ("public"."has_account_access"("account_id"));

-- Update RLS for gmail_accounts
DROP POLICY IF EXISTS "Users can delete own gmail accounts" ON "public"."gmail_accounts";
DROP POLICY IF EXISTS "Users can insert own gmail accounts" ON "public"."gmail_accounts";
DROP POLICY IF EXISTS "Users can update own gmail accounts" ON "public"."gmail_accounts";
DROP POLICY IF EXISTS "Users can view own gmail accounts" ON "public"."gmail_accounts";

CREATE POLICY "gmail_accounts_access_by_account" ON "public"."gmail_accounts"
    FOR ALL USING ("public"."has_account_access"("account_id"));

-- Update RLS for tickets
DROP POLICY IF EXISTS "Users can delete own tickets" ON "public"."tickets";
DROP POLICY IF EXISTS "Users can insert own tickets" ON "public"."tickets";
DROP POLICY IF EXISTS "Users can update own tickets" ON "public"."tickets";
DROP POLICY IF EXISTS "Users can view own tickets" ON "public"."tickets";

CREATE POLICY "tickets_access_by_account" ON "public"."tickets"
    FOR ALL USING ("public"."has_account_access"("account_id"));

-- Update RLS for kb_articles
DROP POLICY IF EXISTS "Users CRUD own kb_articles" ON "public"."kb_articles";
CREATE POLICY "kb_articles_access_by_account" ON "public"."kb_articles"
    FOR ALL USING ("public"."has_account_access"("account_id"));

-- Update RLS for communication tables
DROP POLICY IF EXISTS "Users can delete own channel integrations" ON "public"."channel_integrations";
DROP POLICY IF EXISTS "Users can insert own channel integrations" ON "public"."channel_integrations";
DROP POLICY IF EXISTS "Users can update own channel integrations" ON "public"."channel_integrations";
DROP POLICY IF EXISTS "Users can view own channel integrations" ON "public"."channel_integrations";

CREATE POLICY "channel_integrations_access_by_account" ON "public"."channel_integrations"
    FOR ALL USING ("public"."has_account_access"("account_id"));

DROP POLICY IF EXISTS "Users can insert own conversations" ON "public"."conversations";
DROP POLICY IF EXISTS "Users can update own conversations" ON "public"."conversations";
DROP POLICY IF EXISTS "Users can view own conversations" ON "public"."conversations";

CREATE POLICY "conversations_access_by_account" ON "public"."conversations"
    FOR ALL USING ("public"."has_account_access"("account_id"));

DROP POLICY IF EXISTS "Users can insert own messages" ON "public"."messages";
DROP POLICY IF EXISTS "Users can view own messages" ON "public"."messages";

CREATE POLICY "messages_access_by_account" ON "public"."messages"
    FOR ALL USING ("public"."has_account_access"("account_id"));
