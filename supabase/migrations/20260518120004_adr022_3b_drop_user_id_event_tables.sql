-- ADR-022 Sub-fase 3b: drop user_id from event tables (append-only, low risk)
-- Tables: csat_events, escalations, escalation_contacts

-- ─────────────────────────────────────────────────────────────────────────────
-- csat_events
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.csat_events
  DROP CONSTRAINT IF EXISTS csat_events_user_id_fkey;

ALTER TABLE public.csat_events
  DROP COLUMN IF EXISTS user_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- escalations
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.escalations
  DROP CONSTRAINT IF EXISTS escalations_user_id_fkey;

ALTER TABLE public.escalations
  DROP COLUMN IF EXISTS user_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- escalation_contacts
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.escalation_contacts
  DROP CONSTRAINT IF EXISTS escalation_contacts_user_id_fkey;

ALTER TABLE public.escalation_contacts
  DROP COLUMN IF EXISTS user_id;
