-- Backfill data: Create one account per existing user (1:1 mapping, current users become owners).
-- Idempotent: skips users that already have an account_member row.
DO $$
DECLARE
    user_record RECORD;
    v_account_id uuid;
    v_account_name text;
    v_slug_base text;
    v_slug text;
    v_plan text;
BEGIN
    -- Join profiles with auth.users to get email (profiles may not store email directly)
    FOR user_record IN
        SELECT
            p.id,
            u.email,
            p.company_name,
            p.name AS display_name
        FROM "public"."profiles" p
        JOIN "auth"."users" u ON u.id = p.id
    LOOP
        -- Idempotency: skip if this user already belongs to an account
        IF EXISTS (SELECT 1 FROM "public"."account_members" WHERE "user_id" = user_record.id) THEN
            CONTINUE;
        END IF;

        -- (6) Derive a human-readable account name
        v_account_name := COALESCE(
            NULLIF(trim(user_record.company_name), ''),
            NULLIF(trim(user_record.display_name), ''),
            split_part(user_record.email, '@', 1)
        );

        -- (7) Derive a URL-safe slug from the name + 6-char random suffix to avoid collisions
        v_slug_base := lower(regexp_replace(trim(v_account_name), '[^a-z0-9]+', '-', 'g'));
        v_slug_base := trim(both '-' from v_slug_base);  -- strip leading/trailing hyphens
        v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

        -- (8) Use the highest plan the user already had in clients, fall back to 'Starter'
        SELECT COALESCE(
            (SELECT plan_type FROM "public"."clients"
             WHERE "user_id" = user_record.id
             ORDER BY CASE plan_type
                 WHEN 'Enterprise' THEN 1
                 WHEN 'Pro'        THEN 2
                 ELSE                   3
             END
             LIMIT 1),
            'Starter'
        ) INTO v_plan;

        INSERT INTO "public"."accounts" ("name", "slug", "plan_type", "seat_limit")
        VALUES (v_account_name, v_slug, v_plan, 5)
        RETURNING id INTO v_account_id;

        -- Owner membership — joined_at set to now() because they are already active
        INSERT INTO "public"."account_members" ("account_id", "user_id", "role", "status", "joined_at")
        VALUES (v_account_id, user_record.id, 'owner', 'active', now());

        -- Rekey direct user_id tables
        UPDATE "public"."clients"              SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."tenant_priority_config" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."tenant_sla_rules"     SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."support_schedules"    SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."gmail_accounts"       SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."tickets"              SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."kb_articles"          SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."channel_integrations" SET "account_id" = v_account_id WHERE "user_id" = user_record.id;
        UPDATE "public"."conversations"        SET "account_id" = v_account_id WHERE "user_id" = user_record.id;

        -- (9) messages has no user_id — derive via conversation ownership
        UPDATE "public"."messages" m
        SET "account_id" = v_account_id
        FROM "public"."conversations" c
        WHERE m."conversation_id" = c."id"
        AND c."user_id" = user_record.id;

    END LOOP;
END $$;
