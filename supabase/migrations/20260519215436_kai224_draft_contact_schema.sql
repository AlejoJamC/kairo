-- Extensión necesaria para email case-insensitive
CREATE EXTENSION IF NOT EXISTS citext;

-- Helper genérico para updated_at (reutilizable por otras tablas en el futuro)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Enums
CREATE TYPE public.draft_contact_status AS ENUM (
  'proposed', 'confirmed', 'rejected', 'merged_into'
);

CREATE TYPE public.draft_contact_origin AS ENUM (
  'kairo_created', 'external_synced'
);

-- Tabla
CREATE TABLE public.draft_contact (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  email           citext,
  phone           text,
  display_name    text,
  organization    text,

  status          public.draft_contact_status NOT NULL DEFAULT 'proposed',
  merged_into_id  uuid REFERENCES public.draft_contact(id) ON DELETE SET NULL,
  confidence      real NOT NULL DEFAULT 0.0,
  evidence_count  integer NOT NULL DEFAULT 0,

  origin          public.draft_contact_origin NOT NULL DEFAULT 'kairo_created',
  external_ref    text,
  external_source text,

  source_tickets  uuid[] NOT NULL DEFAULT '{}',
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz,
  confirmed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT draft_contact_has_identity
    CHECK (email IS NOT NULL OR phone IS NOT NULL),

  CONSTRAINT draft_contact_external_consistency
    CHECK (
      origin = 'kairo_created'
      OR (external_source IS NOT NULL AND external_ref IS NOT NULL)
    ),

  CONSTRAINT draft_contact_confirmation_consistency
    CHECK (
      (status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
      OR (status <> 'confirmed')
    ),

  CONSTRAINT draft_contact_confidence_range
    CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

-- Índices
CREATE UNIQUE INDEX idx_draft_contact_account_email
  ON public.draft_contact (account_id, email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX idx_draft_contact_account_phone
  ON public.draft_contact (account_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX idx_draft_contact_account_status
  ON public.draft_contact (account_id, status);

CREATE INDEX idx_draft_contact_account_org
  ON public.draft_contact (account_id, organization)
  WHERE organization IS NOT NULL;

CREATE INDEX idx_draft_contact_metadata_gin
  ON public.draft_contact USING gin (metadata);

CREATE INDEX idx_draft_contact_source_tickets_gin
  ON public.draft_contact USING gin (source_tickets);

-- Trigger updated_at
CREATE TRIGGER trg_draft_contact_updated_at
  BEFORE UPDATE ON public.draft_contact
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.draft_contact ENABLE ROW LEVEL SECURITY;

CREATE POLICY draft_contact_select ON public.draft_contact
  FOR SELECT
  USING (account_id = public.current_account_id());

CREATE POLICY draft_contact_insert ON public.draft_contact
  FOR INSERT
  WITH CHECK (account_id = public.current_account_id());

CREATE POLICY draft_contact_update ON public.draft_contact
  FOR UPDATE
  USING (account_id = public.current_account_id())
  WITH CHECK (account_id = public.current_account_id());

-- No DELETE policy: soft-delete via status='rejected' o 'merged_into'.

COMMENT ON TABLE public.draft_contact IS
  'Pipeline de identidades de contacto propuestas por el extractor. Confirmar no migra a otra tabla, solo cambia status. KAI-224.';
COMMENT ON COLUMN public.draft_contact.confirmed_by IS
  'auth.users.id del agente que confirmo. Patron del codebase: actor FKs apuntan a auth.users, no a account_members.';
