-- KAI-114: Outbound outbox pattern foundation (ADR-023 §1)
--
-- Converts outbound message sending from a synchronous "send-then-persist"
-- prototype into an outbox: messages are persisted first with an explicit
-- delivery_status, and an Inngest worker drives queued -> sending -> sent|failed.
--
-- external_id (the provider's message id) is no longer known at insert time
-- for queued outbound messages, so it must become nullable. Postgres treats
-- multiple NULLs as distinct under UNIQUE, so the existing
-- (channel_integration_id, external_id) constraint stays intact for sent messages.

ALTER TABLE public.messages
  ALTER COLUMN external_id DROP NOT NULL;

ALTER TABLE public.messages
  ADD COLUMN delivery_status text,
  ADD COLUMN send_error      jsonb,
  ADD COLUMN send_attempts   integer NOT NULL DEFAULT 0;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_delivery_status_check
    CHECK (delivery_status IS NULL OR delivery_status IN ('queued', 'sending', 'sent', 'failed'));

COMMENT ON COLUMN public.messages.delivery_status IS
  'Outbox delivery state for outbound messages: queued -> sending -> sent | failed. NULL for inbound messages. KAI-114.';
COMMENT ON COLUMN public.messages.send_error IS
  'Last send error detail ({ code, message }) when delivery_status = failed. KAI-114.';
COMMENT ON COLUMN public.messages.send_attempts IS
  'Number of send attempts made by the outbound worker. KAI-114.';

-- Backfill: outbound messages inserted under the old synchronous model were
-- already delivered by the time they were persisted.
UPDATE public.messages
  SET delivery_status = 'sent'
  WHERE direction = 'outbound' AND delivery_status IS NULL;
