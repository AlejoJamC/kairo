ALTER TABLE public.accounts
  ADD COLUMN industry text,
  ADD COLUMN onboarding_completed_at timestamp with time zone;

ALTER TABLE public.accounts
  ADD CONSTRAINT chk_accounts_industry CHECK (
    industry IS NULL OR industry IN ('customer_service', 'financial', 'technology', 'legal', 'accounting', 'other')
  );

COMMENT ON COLUMN public.accounts.industry IS 'Industry chosen during onboarding; skipping records other. NULL only on accounts that predate the setting, which classify without industry guidance. other reads as customer_service.';
COMMENT ON COLUMN public.accounts.onboarding_completed_at IS 'Set once when the owner finishes or skips the onboarding walkthrough. Accounts created before this column are completed when the owner profile has a company name.';
