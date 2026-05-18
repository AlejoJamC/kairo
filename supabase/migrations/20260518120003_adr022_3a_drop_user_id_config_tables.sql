-- ADR-022 Sub-fase 3a: drop user_id from configuration tables (low-traffic, low-risk)
-- Tables: tenant_priority_config, tenant_sla_rules, support_schedules, response_templates

-- ─────────────────────────────────────────────────────────────────────────────
-- tenant_priority_config
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_priority_config
  DROP CONSTRAINT IF EXISTS tenant_priority_config_user_id_key;

ALTER TABLE public.tenant_priority_config
  DROP CONSTRAINT IF EXISTS tenant_priority_config_user_id_fkey;

ALTER TABLE public.tenant_priority_config
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.tenant_priority_config
  ADD CONSTRAINT tenant_priority_config_account_id_key UNIQUE (account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- tenant_sla_rules
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_sla_rules
  DROP CONSTRAINT IF EXISTS tenant_sla_rules_user_id_ticket_type_plan_tier_key;

ALTER TABLE public.tenant_sla_rules
  DROP CONSTRAINT IF EXISTS tenant_sla_rules_user_id_fkey;

ALTER TABLE public.tenant_sla_rules
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.tenant_sla_rules
  ADD CONSTRAINT tenant_sla_rules_account_id_ticket_type_plan_tier_key
  UNIQUE (account_id, ticket_type, plan_tier);

-- ─────────────────────────────────────────────────────────────────────────────
-- support_schedules
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.support_schedules
  DROP CONSTRAINT IF EXISTS support_schedules_user_id_day_of_week_key;

ALTER TABLE public.support_schedules
  DROP CONSTRAINT IF EXISTS support_schedules_user_id_fkey;

ALTER TABLE public.support_schedules
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.support_schedules
  ADD CONSTRAINT support_schedules_account_id_day_of_week_key
  UNIQUE (account_id, day_of_week);

-- ─────────────────────────────────────────────────────────────────────────────
-- response_templates
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_response_templates_user_id;
DROP INDEX IF EXISTS public.idx_response_templates_locale;

ALTER TABLE public.response_templates
  DROP CONSTRAINT IF EXISTS response_templates_user_id_fkey;

ALTER TABLE public.response_templates
  DROP COLUMN IF EXISTS user_id;

CREATE INDEX idx_response_templates_account_id
  ON public.response_templates (account_id) WHERE is_active = true;

CREATE INDEX idx_response_templates_locale
  ON public.response_templates (account_id, locale) WHERE is_active = true;
