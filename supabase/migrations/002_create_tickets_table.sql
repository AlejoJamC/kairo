-- =====================================================
-- Tickets Table (Email Storage)
-- =====================================================
-- Stores emails from Gmail as support tickets
-- One ticket = One email (no threading yet)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Gmail identifiers (for deduplication)
  gmail_message_id TEXT NOT NULL, -- Gmail's unique message ID
  gmail_thread_id TEXT,           -- Gmail's thread ID (for future threading)

  -- Email metadata
  subject TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT,
  cc_emails TEXT[],               -- Array of CC recipients
  received_at TIMESTAMPTZ NOT NULL,

  -- Email content
  body_plain TEXT,                -- Plain text body
  body_html TEXT,                 -- HTML body
  snippet TEXT,                   -- Gmail's auto-generated snippet

  -- AI Classification (NULL for now, will be filled in Phase 2)
  ticket_type TEXT,               -- 'support', 'lead', 'spam'
  priority TEXT,                  -- 'P1', 'P2', 'P3'
  category TEXT,                  -- 'billing', 'technical', 'sales'
  sentiment TEXT,                 -- 'urgent', 'casual', 'frustrated'

  -- Status management
  status TEXT DEFAULT 'open',     -- 'open', 'resolved', 'archived'
  assigned_to UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure no duplicate Gmail messages per user
  UNIQUE(user_id, gmail_message_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_gmail_message_id ON public.tickets(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_received_at ON public.tickets(received_at DESC);

-- Row Level Security
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tickets"
  ON public.tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tickets"
  ON public.tickets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tickets"
  ON public.tickets FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
DROP TRIGGER IF EXISTS on_tickets_updated ON public.tickets;
CREATE TRIGGER on_tickets_updated
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- MIGRATION COMPLETE
-- Execute this SQL in Supabase Dashboard → SQL Editor
-- =====================================================
