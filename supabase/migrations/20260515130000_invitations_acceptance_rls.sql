-- =============================================================================
-- KAI-171: RLS policies and helper function for the invitation acceptance flow
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Public lookup function (SECURITY DEFINER = bypasses RLS safely)
--    Called via supabase.rpc() from unauthenticated landing pages.
--    Returns nothing if token is expired or doesn't exist.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_invitation_by_token"("p_token" uuid)
RETURNS TABLE (
    "id"           uuid,
    "account_id"   uuid,
    "account_name" text,
    "email"        text,
    "role"         text,
    "expires_at"   timestamptz
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT
        ai.id,
        ai.account_id,
        acc.name AS account_name,
        ai.email,
        ai.role,
        ai.expires_at
    FROM "public"."account_invitations" ai
    JOIN "public"."accounts" acc ON acc.id = ai.account_id
    WHERE ai.token = p_token
      AND ai.expires_at > now();
$$;

-- -----------------------------------------------------------------------------
-- 2. Allow authenticated users to INSERT themselves into account_members
--    when a valid, non-expired invitation exists for their email + account.
--    The role in the INSERT must exactly match the role on the invitation —
--    invitees cannot upgrade their own role.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can accept own invitation" ON "public"."account_members";
CREATE POLICY "Users can accept own invitation" ON "public"."account_members"
    FOR INSERT WITH CHECK (
        "user_id" = auth.uid()
        AND "status" = 'active'
        AND EXISTS (
            SELECT 1 FROM "public"."account_invitations" ai
            WHERE ai."account_id" = "account_members"."account_id"
              AND ai."email"      = (SELECT email FROM auth.users WHERE id = auth.uid())
              AND ai."role"       = "account_members"."role"
              AND ai."expires_at" > now()
        )
    );

-- -----------------------------------------------------------------------------
-- 3. Allow the invited user to delete their own invitation after accepting.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Invited user can delete own invitation" ON "public"."account_invitations";
CREATE POLICY "Invited user can delete own invitation" ON "public"."account_invitations"
    FOR DELETE USING (
        "email" = (SELECT email FROM auth.users WHERE id = auth.uid())
    );
