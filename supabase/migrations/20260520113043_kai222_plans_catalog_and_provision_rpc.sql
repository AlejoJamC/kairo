-- =============================================================================
-- KAI-222 (IAM-13): Plans catalog + account plan_type → plan_id migration
-- =============================================================================
--
-- Replaces the magic-string `accounts.plan_type` with a proper `plans` catalog
-- table. Adds `accounts.plan_id` FK, backfills from `accounts.plan_type`,
-- drops `accounts.plan_type`. Makes `accounts.seat_limit` nullable (override).
-- Rewrites provision_account_for_user with p_plan_code + p_seat_limit params.
-- Adds a helper function account_effective_seat_limit().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create plans catalog table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
    id                uuid        NOT NULL DEFAULT gen_random_uuid(),
    code              text        NOT NULL,
    name              text        NOT NULL,
    seat_limit_default int        NOT NULL CHECK (seat_limit_default > 0),
    is_public         boolean     NOT NULL DEFAULT true,
    sort_order        int         NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plans_pkey PRIMARY KEY (id),
    CONSTRAINT plans_code_key UNIQUE (code)
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Public read for authenticated users (pricing catalog)
CREATE POLICY "Plans are viewable by authenticated users"
    ON public.plans
    FOR SELECT
    TO authenticated
    USING (true);

-- updated_at trigger — inline since update_updated_at_column doesn't exist in this repo
CREATE OR REPLACE FUNCTION public.update_plans_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON public.plans
    FOR EACH ROW
    EXECUTE FUNCTION public.update_plans_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Seed initial plans (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.plans (code, name, seat_limit_default, is_public, sort_order)
VALUES
    ('starter',    'Starter',    5,   true, 10),
    ('pro',        'Pro',        25,  true, 20),
    ('enterprise', 'Enterprise', 100, true, 30)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Add accounts.plan_id (nullable first for backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 4. Backfill plan_id from plan_type (case-insensitive match)
-- ---------------------------------------------------------------------------
UPDATE public.accounts a
SET plan_id = p.id
FROM public.plans p
WHERE lower(a.plan_type) = p.code
  AND a.plan_id IS NULL;

-- Guard: fail migration if any row was left unmatched
DO $$
DECLARE
    v_unmatched int;
BEGIN
    SELECT COUNT(*) INTO v_unmatched
    FROM public.accounts
    WHERE plan_id IS NULL;

    IF v_unmatched > 0 THEN
        RAISE EXCEPTION
            'KAI-222 backfill failed: % accounts have plan_id IS NULL. '
            'Unrecognised plan_type values exist in accounts table.',
            v_unmatched;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Trigger to set default plan_id (starter) on INSERT when not provided
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_default_plan_id_on_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.plan_id IS NULL THEN
        SELECT id INTO NEW.plan_id
        FROM public.plans
        WHERE code = 'starter'
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounts_default_plan_id
    BEFORE INSERT ON public.accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_default_plan_id_on_accounts();

-- Make plan_id NOT NULL after backfill + trigger in place
ALTER TABLE public.accounts
    ALTER COLUMN plan_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Drop accounts.plan_type and its CHECK constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_plan_type_check;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS plan_type;

-- ---------------------------------------------------------------------------
-- 7. Make accounts.seat_limit nullable (override; NULL = use plan default)
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts
    ALTER COLUMN seat_limit DROP NOT NULL,
    ALTER COLUMN seat_limit DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 8. Helper function: account_effective_seat_limit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_effective_seat_limit(p_account_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(a.seat_limit, p.seat_limit_default)
    FROM public.accounts a
    JOIN public.plans p ON p.id = a.plan_id
    WHERE a.id = p_account_id;
$$;

REVOKE ALL ON FUNCTION public.account_effective_seat_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_effective_seat_limit(uuid)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Rewrite provision_account_for_user with new signature
-- ---------------------------------------------------------------------------

-- Drop the old signature explicitly
DROP FUNCTION IF EXISTS public.provision_account_for_user(uuid, text);

CREATE OR REPLACE FUNCTION public.provision_account_for_user(
    p_user_id      uuid,
    p_account_name text DEFAULT NULL,
    p_plan_code    text DEFAULT 'starter',
    p_seat_limit   int  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id  uuid;
    v_account_id   uuid;
    v_plan_id      uuid;
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

    -- ── Resolve plan_id from p_plan_code ──────────────────────────────────
    SELECT id INTO v_plan_id
    FROM public.plans
    WHERE code = p_plan_code
    LIMIT 1;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'provision_account_for_user: invalid plan_code: %', p_plan_code;
    END IF;

    -- ── Resolve user identity for name derivation ──────────────────────────
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

    IF v_name IS NULL OR trim(v_name) = '' THEN
        v_name := 'account';
    END IF;

    -- ── Derive URL-safe slug with random suffix ────────────────────────────
    v_slug_base := lower(regexp_replace(trim(v_name), '[^a-z0-9]+', '-', 'g'));
    v_slug_base := trim(both '-' from v_slug_base);
    IF v_slug_base = '' THEN
        v_slug_base := 'account';
    END IF;
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

    -- ── Atomic insert: accounts + account_members ──────────────────────────
    BEGIN
        INSERT INTO public.accounts (name, slug, plan_id, seat_limit)
        VALUES (v_name, v_slug, v_plan_id, p_seat_limit)
        RETURNING id INTO v_account_id;

        INSERT INTO public.account_members
            (account_id, user_id, role, status, joined_at)
        VALUES
            (v_account_id, p_user_id, 'owner', 'active', now());

    EXCEPTION
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

REVOKE ALL ON FUNCTION public.provision_account_for_user(uuid, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_account_for_user(uuid, text, text, int)
    TO authenticated, service_role;

-- Grant table access
GRANT SELECT ON public.plans TO authenticated, anon;
GRANT ALL ON public.plans TO service_role;
