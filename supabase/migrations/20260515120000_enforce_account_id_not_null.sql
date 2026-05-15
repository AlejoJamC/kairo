-- =============================================================================
-- KAI-174: Enforce account_id NOT NULL after backfill validation
-- =============================================================================
-- Context: account_id columns were added as nullable in KAI-169 to allow a
-- safe backfill (20260513145449_backfill_multi_tenancy_data.sql). That backfill
-- has been confirmed complete — 0 NULL rows across all 14 affected tables.
-- This migration locks down the schema by making account_id NOT NULL.
--
-- llm_calls is intentionally excluded: its account_id is ON DELETE SET NULL
-- by design (a deleted account must not cascade-delete observability records).
--
-- ROLLBACK PLAN (if this migration must be reverted):
--   For each table listed below, run:
--     ALTER TABLE public.<table> ALTER COLUMN account_id DROP NOT NULL;
--   No data loss occurs — this only removes the constraint, not the column.
--   The backfill data and FK relationships remain intact.
-- =============================================================================

-- Step 1: Assert zero NULLs before locking — fail fast with a clear message
-- if any row slipped through the backfill (e.g. a race condition on a busy prod).
DO $$
DECLARE
    v_nulls bigint;
    v_table text;
    v_tables text[] := ARRAY[
        'clients', 'tenant_priority_config', 'tenant_sla_rules',
        'support_schedules', 'gmail_accounts', 'tickets', 'kb_articles',
        'channel_integrations', 'conversations', 'messages',
        'response_templates', 'ticket_groups', 'escalation_contacts',
        'classification_feedback'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        EXECUTE format(
            'SELECT COUNT(*) FROM public.%I WHERE account_id IS NULL',
            v_table
        ) INTO v_nulls;

        IF v_nulls > 0 THEN
            RAISE EXCEPTION
                'KAI-174 pre-flight failed: table "%" has % row(s) with NULL account_id. '
                'Re-run the backfill migration before enforcing NOT NULL.',
                v_table, v_nulls;
        END IF;
    END LOOP;
END $$;

-- Step 2: Add NOT NULL constraint to all validated tables
ALTER TABLE "public"."clients"                 ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."tenant_priority_config"  ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."tenant_sla_rules"        ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."support_schedules"       ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."gmail_accounts"          ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."tickets"                 ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."kb_articles"             ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."channel_integrations"    ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."conversations"           ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."messages"                ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."response_templates"      ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."ticket_groups"           ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."escalation_contacts"     ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "public"."classification_feedback" ALTER COLUMN "account_id" SET NOT NULL;

-- llm_calls: intentionally left nullable (ON DELETE SET NULL — see header comment).

-- Note on user_id columns:
-- The legacy user_id columns remain in place on all tables above.
-- They will be removed in a separate migration after verifying that no
-- application code or API consumer still references them directly.
-- Dropping user_id now would be premature and could break running instances
-- before a full deploy cycle completes.
