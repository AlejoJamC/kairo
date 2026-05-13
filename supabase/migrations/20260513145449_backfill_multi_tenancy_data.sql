-- Backfill data: Create one account per existing user
DO $$
DECLARE
    user_record RECORD;
    v_account_id uuid;
BEGIN
    FOR user_record IN SELECT id, email FROM "public"."profiles" LOOP
        -- Create an account for the user
        INSERT INTO "public"."accounts" ("name", "slug", "plan_type", "seat_limit")
        VALUES (
            user_record.email || ' Account',
            'acc-' || replace(user_record.id::text, '-', ''),
            'Starter',
            5
        ) RETURNING id INTO v_account_id;

        -- Make the user the owner of this account
        INSERT INTO "public"."account_members" ("account_id", "user_id", "role", "status")
        VALUES (v_account_id, user_record.id, 'owner', 'active');

        -- Update all related tables
        UPDATE "public"."clients" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."tenant_priority_config" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."tenant_sla_rules" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."support_schedules" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."gmail_accounts" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."tickets" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."kb_articles" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."channel_integrations" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."conversations" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."messages" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
    END LOOP;
END $$;
