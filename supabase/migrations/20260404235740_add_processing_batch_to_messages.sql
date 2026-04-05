-- Migration 008: add processing_batch to messages
-- KAI-103: ADR-017 — marks each message row with the pipeline pass that
-- processed it. 'onboarding' = initial 90-day backfill (KAI-75 tiers),
-- 'incremental' = recurring sync after onboarding is complete.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS processing_batch TEXT;

COMMENT ON COLUMN public.messages.processing_batch IS
  'onboarding = initial 90-day backfill, incremental = recurring sync';

CREATE INDEX IF NOT EXISTS idx_messages_processing_batch
  ON public.messages(processing_batch);
