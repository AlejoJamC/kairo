-- KAI-122: create classification_feedback for direct human corrections
--
-- Separate from categorization_feedback (proposal-acceptance tracking).
-- This table is what batch-classify and tickets routes already query
-- to protect human-corrected tickets from AI re-classification.
-- Field names use English to match the tickets table convention.

CREATE TABLE public.classification_feedback (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        UUID        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL,
  corrected_by     UUID        NOT NULL REFERENCES auth.users(id),

  -- AI snapshot at correction time
  ai_ticket_type   TEXT,
  ai_priority      TEXT,
  ai_category      TEXT,
  ai_sentiment     TEXT,
  ai_model_version TEXT,
  ai_confidence    NUMERIC(3,2),

  -- Human correction (nullable: agent may correct only one field)
  correct_ticket_type  TEXT,
  correct_priority     TEXT,
  correct_category     TEXT,
  correct_sentiment    TEXT,

  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_cf_priority
    CHECK (correct_priority IS NULL OR correct_priority IN ('P1','P2','P3')),
  CONSTRAINT chk_cf_category
    CHECK (correct_category IS NULL OR correct_category IN ('technical','billing','account','general','not_applicable')),
  CONSTRAINT chk_cf_ticket_type
    CHECK (correct_ticket_type IS NULL OR correct_ticket_type IN ('support','prospect','spam','internal','other')),
  CONSTRAINT chk_cf_sentiment
    CHECK (correct_sentiment IS NULL OR correct_sentiment IN ('aggressive','frustrated','neutral','positive'))
);

CREATE INDEX idx_classification_feedback_ticket_id
  ON public.classification_feedback(ticket_id);
CREATE INDEX idx_classification_feedback_user_id
  ON public.classification_feedback(user_id);
CREATE INDEX idx_classification_feedback_created_at
  ON public.classification_feedback(created_at DESC);

ALTER TABLE public.classification_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own classification feedback"
  ON public.classification_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own classification feedback"
  ON public.classification_feedback FOR SELECT
  USING (auth.uid() = user_id);

GRANT ALL ON public.classification_feedback TO anon;
GRANT ALL ON public.classification_feedback TO authenticated;
GRANT ALL ON public.classification_feedback TO service_role;
