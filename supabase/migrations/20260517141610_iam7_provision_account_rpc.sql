-- =============================================================================
-- KAI-217 (IAM-8): provision_account_for_user RPC + defensive signup trigger
-- =============================================================================
--
-- Problem: After the multi-tenant rework (KAI-169→KAI-174), 14 tables carry
-- account_id NOT NULL, but there is NO code path that creates an `accounts` row
-- for a brand-new OAuth user without a pending invitation. The one-time backfill
-- migration (20260513145449) plugged the gap for legacy data but never runs again.
--
-- Solution (two layers):
--
--  Layer 1 — RPC public.provision_account_for_user(uuid, text)
--    Idempotent, transactional, SECURITY DEFINER function that creates an
--    accounts + account_members(owner, active) pair for a user who has none.
--    Called explicitly by the OAuth callback (KAI-218) and reusable by any
--    future code that needs to ensure a user has a home account.
--
--  Layer 2 — Trigger auth.users → z_ensure_account_on_signup
--    Best-effort defensive net: fires AFTER INSERT on auth.users (after
--    handle_new_user has created the profile) and calls the same RPC.
--    If it fails, it emits a WARNING and does not block the signup.
--    Named with z_ prefix so it fires after `on_auth_user_created` (which
--    creates the profile row that provision_account_for_user reads).
--
-- Idempotency guarantee:
--    Both layers share the same guard:
--      SELECT account_id FROM account_members WHERE user_id=p_user_id AND status='active'
--    If a row already exists the function returns early without touching anything.
--    Two concurrent calls (e.g. trigger + callback race) resolve safely because
--    the second INSERT into account_members fails on the UNIQUE constraint
--    (account_members_account_user_unique), which is caught inside the function
--    and resolved with a fallback SELECT.
--
-- Slug logic mirrors the one-time backfill (20260513145449_backfill_multi_tenancy_data.sql)
-- exactly so both paths produce structurally identical data.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. provision_account_for_user(p_user_id, p_account_name)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_account_for_user(
    p_user_id      uuid,
    p_account_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id  uuid;
    v_account_id   uuid;
    v_name         text;
    v_slug_base    text;
    v_slug         text;
    v_email        text;
    v_display_name text;
    v_company_name text;
BEGIN
    -- ── Guard: return existing account_id if user already has an active membership ──
    SELECT am.account_id INTO v_existing_id
    FROM public.account_members am
    WHERE am.user_id  = p_user_id
      AND am.status   = 'active'
    ORDER BY am.joined_at NULLS LAST, am.invited_at NULLS LAST
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    -- ── Resolve user identity for name derivation ──────────────────────────
    -- profiles is written by handle_new_user trigger before this function
    -- runs (trigger order: on_auth_user_created < z_ensure_account_on_signup).
    -- In the explicit-RPC path the profile is always committed first.
    SELECT u.email,
           COALESCE(p.name, ''),
           COALESCE(p.company_name, '')
      INTO v_email, v_display_name, v_company_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = p_user_id;

    IF v_email IS NULL THEN
        RAISE EXCEPTION
            'provision_account_for_user: user % not found in auth.users', p_user_id;
    END IF;

    -- ── Derive account name (priority: explicit arg > company_name > display_name > email prefix) ──
    v_name := COALESCE(
        NULLIF(trim(p_account_name),  ''),
        NULLIF(trim(v_company_name),  ''),
        NULLIF(trim(v_display_name),  ''),
        split_part(v_email, '@', 1)
    );

    -- Final fallback — should never be reached but defensively guard empty slug
    IF v_name IS NULL OR trim(v_name) = '' THEN
        v_name := 'account';
    END IF;

    -- ── Derive URL-safe slug with random suffix (mirrors backfill logic) ───
    v_slug_base := lower(regexp_replace(trim(v_name), '[^a-z0-9]+', '-', 'g'));
    v_slug_base := trim(both '-' from v_slug_base);
    IF v_slug_base = '' THEN
        v_slug_base := 'account';
    END IF;
    -- 6-char random hex suffix keeps slugs unique even for users with identical names
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

    -- ── Atomic insert: accounts + account_members ──────────────────────────
    -- The entire function body executes inside a single implicit PL/pgSQL
    -- transaction when called from an outer transaction (e.g. trigger).
    -- If any statement below fails, the whole function rolls back.
    BEGIN
        INSERT INTO public.accounts (name, slug, plan_type, seat_limit)
        VALUES (v_name, v_slug, 'Starter', 5)
        RETURNING id INTO v_account_id;

        INSERT INTO public.account_members
            (account_id, user_id, role, status, joined_at)
        VALUES
            (v_account_id, p_user_id, 'owner', 'active', now());

    EXCEPTION
        -- Race condition: a concurrent call already inserted account_members
        -- for this user between our guard SELECT and our INSERT.
        -- Recover by looking up the winner's account_id.
        WHEN unique_violation THEN
            SELECT am.account_id INTO v_account_id
            FROM public.account_members am
            WHERE am.user_id = p_user_id
              AND am.status  = 'active'
            ORDER BY am.joined_at NULLS LAST
            LIMIT 1;

            IF v_account_id IS NULL THEN
                RAISE EXCEPTION
                    'provision_account_for_user: unique_violation but no membership found for user %',
                    p_user_id;
            END IF;
    END;

    RETURN v_account_id;
END;
$$;

-- Grant to roles that need to call it directly
REVOKE ALL ON FUNCTION public.provision_account_for_user(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.provision_account_for_user(uuid, text)
    TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. ensure_account_on_signup() — trigger function (best-effort)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_account_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Best-effort: a failure here must never block the signup.
    -- The OAuth callback (KAI-218) also calls provision_account_for_user
    -- explicitly, so this is a safety net, not the primary path.
    BEGIN
        PERFORM public.provision_account_for_user(NEW.id, NULL);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING
            '[KAI-217] ensure_account_on_signup: provisioning failed for user % (%): %',
            NEW.id, NEW.email, SQLERRM;
    END;

    RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. Trigger on auth.users
-- ---------------------------------------------------------------------------
-- Named z_ensure_account_on_signup so it fires AFTER on_auth_user_created
-- (which creates the profiles row). Postgres executes AFTER triggers with the
-- same event in alphabetical order: 'o' < 'z', so handle_new_user runs first.

DROP TRIGGER IF EXISTS z_ensure_account_on_signup ON auth.users;

CREATE TRIGGER z_ensure_account_on_signup
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_account_on_signup();
