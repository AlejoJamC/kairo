-- KAI-170: user_roles is fully replaced by account_members.
-- The RBAC middleware and dashboard auth-context now read role from account_members.
-- Drop policy first, then the table.

DROP POLICY IF EXISTS "users can read own role" ON "public"."user_roles";
DROP TABLE IF EXISTS "public"."user_roles";
