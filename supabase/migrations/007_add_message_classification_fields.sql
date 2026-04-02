-- Migration: 007_add_message_classification_fields
-- KAI-77: Pipeline messages need classification state tracking.
-- Relaxes conversation_id and raw_payload NOT NULL so the Tier 1 pipeline
-- can persist message stubs before full conversation linkage is established.
-- Adds classification_status, skip_reason, processing_tier, classified_at.

-- Relax FK/NOT NULL constraints for pipeline staging rows
ALTER TABLE public.messages
  ALTER COLUMN conversation_id DROP NOT NULL,
  ALTER COLUMN raw_payload     DROP NOT NULL;

-- Add pipeline classification tracking columns
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS classification_status TEXT
    CHECK (
      classification_status IS NULL OR
      classification_status IN ('pending', 'classified', 'skipped', 'failed')
    ),
  ADD COLUMN IF NOT EXISTS skip_reason      TEXT,
  ADD COLUMN IF NOT EXISTS processing_tier  INT,
  ADD COLUMN IF NOT EXISTS classified_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_classification_status
  ON public.messages(classification_status);
CREATE INDEX IF NOT EXISTS idx_messages_processing_tier
  ON public.messages(processing_tier);
