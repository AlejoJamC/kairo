-- =============================================================================
-- KAI-170: Full RLS migration to account-based isolation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. current_account_id() — reads active account from JWT claim first,
--    falls back to LIMIT 1 for single-account users.
--    SECURITY DEFINER prevents recursion when called from RLS policies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."current_account_id"()
RETURNS uuid AS $$
DECLARE
    v_account_id uuid;
BEGIN
    -- Priority 1: explicit account_id claim in the JWT
    -- Set this claim (in app_metadata) when the user logs in or switches accounts.
    BEGIN
        v_account_id := NULLIF(
            current_setting('request.jwt.claims', true)::jsonb ->> 'account_id',
            ''
        )::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_account_id := NULL;
    END;

    -- If a claim is present, validate the user is still an active member of that account.
    -- This prevents a stale/forged claim from granting access.
    IF v_account_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM "public"."account_members"
            WHERE "account_id" = v_account_id
              AND "user_id" = auth.uid()
              AND "status" = 'active'
        ) THEN
            RETURN v_account_id;
        END IF;
        -- Claim present but user is not an active member → deny everything.
        RETURN NULL;
    END IF;

    -- Fallback for single-account users (no claim set).
    -- Deterministic because most users belong to exactly one account.
    SELECT "account_id" INTO v_account_id
    FROM "public"."account_members"
    WHERE "user_id" = auth.uid()
      AND "status" = 'active'
    ORDER BY "joined_at"
    LIMIT 1;

    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- -----------------------------------------------------------------------------
-- 2. account_members: add a policy so members can see their teammates.
--    has_account_access() is SECURITY DEFINER — no recursion risk.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view teammates" ON "public"."account_members";
CREATE POLICY "Members can view teammates" ON "public"."account_members"
    FOR SELECT
    USING ("public"."has_account_access"("account_id"));


-- -----------------------------------------------------------------------------
-- 3. Tables already carrying account_id — replace has_account_access() with
--    the deterministic current_account_id() check.
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- 4. Orphaned tables — ticket-linked (no new column needed).
--    Access is derived through the parent ticket's account_id.
-- -----------------------------------------------------------------------------

-- Ticket Events
DROP POLICY IF EXISTS "Users can view own ticket events" ON "public"."ticket_events";
DROP POLICY IF EXISTS "Users can insert own ticket events" ON "public"."ticket_events";
CREATE POLICY "ticket_events_access_by_account" ON "public"."ticket_events"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."tickets" t
            WHERE t."id" = "public"."ticket_events"."ticket_id"
              AND t."account_id" = "public"."current_account_id"()
        )
    );

-- Ticket Proposals
DROP POLICY IF EXISTS "Users can view own ticket proposals" ON "public"."ticket_proposals";
DROP POLICY IF EXISTS "Users can insert own ticket proposals" ON "public"."ticket_proposals";
DROP POLICY IF EXISTS "Users can update own ticket proposals" ON "public"."ticket_proposals";
CREATE POLICY "ticket_proposals_access_by_account" ON "public"."ticket_proposals"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."tickets" t
            WHERE t."id" = "public"."ticket_proposals"."ticket_id"
              AND t."account_id" = "public"."current_account_id"()
        )
    );

-- Ticket Messages (join table tickets ↔ messages)
DROP POLICY IF EXISTS "Users can view own ticket_messages" ON "public"."ticket_messages";
DROP POLICY IF EXISTS "Users can insert own ticket_messages" ON "public"."ticket_messages";
CREATE POLICY "ticket_messages_access_by_account" ON "public"."ticket_messages"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."tickets" t
            WHERE t."id" = "public"."ticket_messages"."ticket_id"
              AND t."account_id" = "public"."current_account_id"()
        )
    );

-- Ticket Tags
DROP POLICY IF EXISTS "Users can view own ticket tags" ON "public"."ticket_tags";
DROP POLICY IF EXISTS "Users can insert own ticket tags" ON "public"."ticket_tags";
DROP POLICY IF EXISTS "Users can delete own ticket tags" ON "public"."ticket_tags";
CREATE POLICY "ticket_tags_access_by_account" ON "public"."ticket_tags"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."tickets" t
            WHERE t."id" = "public"."ticket_tags"."ticket_id"
              AND t."account_id" = "public"."current_account_id"()
        )
    );

-- Ticket Followers
DROP POLICY IF EXISTS "Users can view own follows" ON "public"."ticket_followers";
DROP POLICY IF EXISTS "Users can insert own follows" ON "public"."ticket_followers";
DROP POLICY IF EXISTS "Users can delete own follows" ON "public"."ticket_followers";
CREATE POLICY "ticket_followers_access_by_account" ON "public"."ticket_followers"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."tickets" t
            WHERE t."id" = "public"."ticket_followers"."ticket_id"
              AND t."account_id" = "public"."current_account_id"()
        )
    );

-- Escalations (linked to tickets)
DROP POLICY IF EXISTS "Users CRUD own escalations" ON "public"."escalations";
CREATE POLICY "escalations_access_by_account" ON "public"."escalations"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."tickets" t
            WHERE t."id" = "public"."escalations"."ticket_id"
              AND t."account_id" = "public"."current_account_id"()
        )
    );

-- CSAT Events (linked to tickets)
DROP POLICY IF EXISTS "Users CRUD own csat_events" ON "public"."csat_events";
CREATE POLICY "csat_events_access_by_account" ON "public"."csat_events"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."tickets" t
            WHERE t."id" = "public"."csat_events"."ticket_id"
              AND t."account_id" = "public"."current_account_id"()
        )
    );


-- -----------------------------------------------------------------------------
-- 5. Orphaned standalone tables — need account_id column added.
-- -----------------------------------------------------------------------------

-- response_templates
ALTER TABLE "public"."response_templates"
    ADD COLUMN IF NOT EXISTS "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "idx_response_templates_account_id" ON "public"."response_templates"("account_id");

UPDATE "public"."response_templates" rt
SET "account_id" = am."account_id"
FROM "public"."account_members" am
WHERE am."user_id" = rt."user_id"
  AND am."status" = 'active'
  AND rt."account_id" IS NULL;

DROP POLICY IF EXISTS "Users can view own templates" ON "public"."response_templates";
DROP POLICY IF EXISTS "Users can insert own templates" ON "public"."response_templates";
DROP POLICY IF EXISTS "Users can update own templates" ON "public"."response_templates";
DROP POLICY IF EXISTS "Users can delete own templates" ON "public"."response_templates";
CREATE POLICY "response_templates_access_by_account" ON "public"."response_templates"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- ticket_groups
ALTER TABLE "public"."ticket_groups"
    ADD COLUMN IF NOT EXISTS "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "idx_ticket_groups_account_id" ON "public"."ticket_groups"("account_id");

UPDATE "public"."ticket_groups" tg
SET "account_id" = am."account_id"
FROM "public"."account_members" am
WHERE am."user_id" = tg."user_id"
  AND am."status" = 'active'
  AND tg."account_id" IS NULL;

DROP POLICY IF EXISTS "tenant_owns_groups" ON "public"."ticket_groups";
CREATE POLICY "ticket_groups_access_by_account" ON "public"."ticket_groups"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- escalation_contacts (standalone — no ticket_id)
ALTER TABLE "public"."escalation_contacts"
    ADD COLUMN IF NOT EXISTS "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "idx_escalation_contacts_account_id" ON "public"."escalation_contacts"("account_id");

UPDATE "public"."escalation_contacts" ec
SET "account_id" = am."account_id"
FROM "public"."account_members" am
WHERE am."user_id" = ec."user_id"
  AND am."status" = 'active'
  AND ec."account_id" IS NULL;

DROP POLICY IF EXISTS "Users CRUD own escalation_contacts" ON "public"."escalation_contacts";
CREATE POLICY "escalation_contacts_access_by_account" ON "public"."escalation_contacts"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- llm_calls (user_id is nullable — backfill via ticket when user_id missing)
ALTER TABLE "public"."llm_calls"
    ADD COLUMN IF NOT EXISTS "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_llm_calls_account_id" ON "public"."llm_calls"("account_id");

-- Backfill via user_id when available
UPDATE "public"."llm_calls" lc
SET "account_id" = am."account_id"
FROM "public"."account_members" am
WHERE am."user_id" = lc."user_id"
  AND am."status" = 'active'
  AND lc."account_id" IS NULL
  AND lc."user_id" IS NOT NULL;

-- Backfill via ticket when user_id is null
UPDATE "public"."llm_calls" lc
SET "account_id" = t."account_id"
FROM "public"."tickets" t
WHERE t."id" = lc."ticket_id"
  AND lc."account_id" IS NULL
  AND lc."ticket_id" IS NOT NULL;

DROP POLICY IF EXISTS "Users can view own llm calls" ON "public"."llm_calls";
CREATE POLICY "llm_calls_access_by_account" ON "public"."llm_calls"
    FOR ALL USING ("account_id" = "public"."current_account_id"());

-- classification_feedback
ALTER TABLE "public"."classification_feedback"
    ADD COLUMN IF NOT EXISTS "account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "idx_classification_feedback_account_id" ON "public"."classification_feedback"("account_id");

UPDATE "public"."classification_feedback" cf
SET "account_id" = am."account_id"
FROM "public"."account_members" am
WHERE am."user_id" = cf."user_id"
  AND am."status" = 'active'
  AND cf."account_id" IS NULL;

DROP POLICY IF EXISTS "Users can insert own classification feedback" ON "public"."classification_feedback";
DROP POLICY IF EXISTS "Users can view own classification feedback" ON "public"."classification_feedback";
CREATE POLICY "classification_feedback_access_by_account" ON "public"."classification_feedback"
    FOR ALL USING ("account_id" = "public"."current_account_id"());
