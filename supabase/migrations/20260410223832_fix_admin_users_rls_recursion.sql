-- Fix infinite recursion in admin_users RLS policies.
--
-- The original policy checked admin_users FROM WITHIN a policy ON admin_users,
-- causing Postgres error 42P17 (infinite recursion).
--
-- Solution: a SECURITY DEFINER function runs with the privileges of its owner
-- (bypassing RLS), so it can query admin_users without triggering the policy.

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_uid = auth.uid()
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_uid = auth.uid()
      AND role = 'superadmin'
  );
$$;

-- Replace the recursive policies with function-based ones
DROP POLICY IF EXISTS "admin_users_self_read" ON public.admin_users;
DROP POLICY IF EXISTS "superadmin_manage" ON public.admin_users;

CREATE POLICY "admin_users_self_read" ON public.admin_users
  FOR SELECT USING (public.is_active_admin());

CREATE POLICY "superadmin_manage" ON public.admin_users
  FOR ALL USING (public.is_superadmin());
