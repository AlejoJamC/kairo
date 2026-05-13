-- Create Accounts table
CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "slug" text UNIQUE NOT NULL,
    "plan_type" text CHECK ("plan_type" = ANY (ARRAY['Enterprise', 'Pro', 'Starter'])),
    "seat_limit" integer DEFAULT 5 NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Create Account Members table
CREATE TABLE IF NOT EXISTS "public"."account_members" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "account_id" uuid NOT NULL REFERENCES "public"."accounts"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "role" text NOT NULL CHECK ("role" = ANY (ARRAY['owner', 'admin', 'supervisor', 'agent'])),
    "status" text DEFAULT 'active' NOT NULL CHECK ("status" = ANY (ARRAY['active', 'invited', 'suspended'])),
    "invited_at" timestamptz,
    "joined_at" timestamptz,  -- NULL until the invitation is accepted; set by the app on acceptance
    CONSTRAINT "account_members_account_user_unique" UNIQUE ("account_id", "user_id")
);

-- Create Account Invitations table
CREATE TABLE IF NOT EXISTS "public"."account_invitations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "account_id" uuid NOT NULL REFERENCES "public"."accounts"("id") ON DELETE CASCADE,
    "email" text NOT NULL,
    "role" text NOT NULL CHECK ("role" = ANY (ARRAY['admin', 'supervisor', 'agent'])),
    "token" uuid UNIQUE DEFAULT gen_random_uuid(),
    "expires_at" timestamptz NOT NULL,
    "invited_by" uuid REFERENCES "auth"."users"("id"),
    "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account_invitations" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounts
CREATE POLICY "Accounts are viewable by members" ON "public"."accounts"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."account_members"
            WHERE "account_id" = "public"."accounts"."id"
            AND "user_id" = auth.uid()
        )
    );

CREATE POLICY "Accounts can be managed by owners and admins" ON "public"."accounts"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."account_members"
            WHERE "account_id" = "public"."accounts"."id"
            AND "user_id" = auth.uid()
            AND "role" IN ('owner', 'admin')
        )
    );

-- Helper: checks if the current user is an active admin/owner of p_account_id.
-- SECURITY DEFINER bypasses RLS on account_members, preventing infinite recursion
-- when this function is called from an account_members policy.
CREATE OR REPLACE FUNCTION "public"."is_account_admin"("p_account_id" uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "public"."account_members"
        WHERE "account_id" = p_account_id
        AND "user_id" = auth.uid()
        AND "status" = 'active'
        AND "role" IN ('owner', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for account_members
CREATE POLICY "Members can view their own account memberships" ON "public"."account_members"
    FOR SELECT USING ("user_id" = auth.uid());

-- Uses is_account_admin (SECURITY DEFINER) to avoid self-referential RLS recursion.
CREATE POLICY "Account admins can manage members" ON "public"."account_members"
    FOR ALL USING ("public"."is_account_admin"("account_id"));

-- RLS Policies for account_invitations
-- Also uses is_account_admin to keep the admin check consistent.
CREATE POLICY "Invitations can be managed by account admins" ON "public"."account_invitations"
    FOR ALL USING ("public"."is_account_admin"("account_id"));

CREATE POLICY "Invitations can be viewed by the invited user" ON "public"."account_invitations"
    FOR SELECT USING ("email" = (SELECT email FROM auth.users WHERE id = auth.uid()));
