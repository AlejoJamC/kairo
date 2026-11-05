ALTER TABLE public.accounts ADD COLUMN onboarding_offered_at timestamp with time zone;

COMMENT ON COLUMN public.accounts.onboarding_offered_at IS 'First time the onboarding setup was shown to the owner. Evidence that the choice was offered: only an account with this value can have its industry assigned as other without the owner choosing.';
