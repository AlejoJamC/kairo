-- KAI-29: add external_thread_id to conversations (omnichannel thread mapping)
-- and last_response_at to tickets (tracks when an agent last replied).
--
-- conversations.external_thread_id maps a conversation to the thread ID in the
-- external channel (Gmail thread, WhatsApp conversation ID, etc.). Each channel
-- owns its thread namespace — this field is intentionally generic.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS external_thread_id TEXT;

-- Index for fast thread lookup when resolving reply targets
CREATE INDEX IF NOT EXISTS idx_conversations_external_thread_id
  ON public.conversations(external_thread_id)
  WHERE external_thread_id IS NOT NULL;

-- Backfill from tickets.gmail_thread_id where conversation link exists
-- (tickets.gmail_thread_id is deprecated per 003_kairo_core_schema)
UPDATE public.conversations c
SET external_thread_id = t.gmail_thread_id
FROM public.tickets t
WHERE t.conversation_id = c.id
  AND t.gmail_thread_id IS NOT NULL
  AND c.external_thread_id IS NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS last_response_at TIMESTAMPTZ;
