-- =====================================================
-- 004_create_clients_table.sql
-- Adds client directory and links tickets to clients
-- =====================================================

-- Ensure trigger function exists (created in earlier migrations).
-- CREATE OR REPLACE is idempotent.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- clients table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identifiers
  internal_id       TEXT          NOT NULL,
  legal_id          TEXT,

  -- Basic info
  name              TEXT          NOT NULL,
  telephone         TEXT,

  -- Contact info
  authorized_emails TEXT[]        DEFAULT ARRAY[]::TEXT[],
  contact_persons   JSONB         DEFAULT '[]'::JSONB,

  -- Business relationship
  plan_type         TEXT          CHECK (plan_type IN ('Enterprise', 'Pro', 'Starter')),
  sla_level         TEXT          CHECK (sla_level IN ('Critical', 'High', 'Standard')),

  -- Metadata
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW(),

  -- internal_id must be unique per user
  UNIQUE(user_id, internal_id)
);

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_name    ON public.clients(user_id, name);

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select_own"
  ON public.clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "clients_insert_own"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients_update_own"
  ON public.clients FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "clients_delete_own"
  ON public.clients FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS on_clients_updated ON public.clients;
CREATE TRIGGER on_clients_updated
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- Link tickets → clients
-- =====================================================
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS client_id UUID
    REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON public.tickets(client_id);
