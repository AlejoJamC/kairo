-- Supabase grants EXECUTE on every new function in public to anon and
-- authenticated directly, and Postgres grants it to PUBLIC. Revoking from
-- PUBLIC alone leaves both direct grants in place, so these SECURITY DEFINER
-- functions, which trust their arguments instead of auth.uid(), were callable
-- with the public anon key. Only the API and the OAuth callback call them,
-- and both use service_role.
REVOKE EXECUTE ON FUNCTION public.apply_ticket_transition(uuid, text, text, uuid, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ticket_transition(uuid, text, text, uuid, text, text, text, jsonb, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.provision_account_for_user(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_account_for_user(uuid, text, text, integer) TO service_role;

-- Functions created from now on start closed: only postgres and service_role
-- can execute them. A function meant for anon or authenticated callers needs
-- an explicit GRANT in its own migration. Existing grants are unchanged.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
