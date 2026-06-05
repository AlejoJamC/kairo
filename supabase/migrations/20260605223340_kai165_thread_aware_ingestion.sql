-- ─────────────────────────────────────────────────────────────────────────────
-- KAI-165 — Thread-aware ingestion: conversations uniqueness + status/event enums
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Drop the incompatible UNIQUE on (channel_integration_id, customer_external_id).
-- Our model is "1 thread = 1 conversation", which requires multiple conversations
-- per customer in the same channel. The table is empty in production today, so
-- the drop is safe. Re-introduces customer-level grouping at the application
-- layer if ever needed (currently not).
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_integration_customer_key;

-- 2) UNIQUE for thread-based conversations. Partial: only thread-bearing rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_channel_thread
  ON public.conversations (account_id, channel_integration_id, external_thread_id)
  WHERE external_thread_id IS NOT NULL;

-- 3) UNIQUE for "active" tickets per conversation (so concurrent ingestions cannot
-- race-create two tickets for the same conversation). Excludes merged duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_account_conversation_active
  ON public.tickets (account_id, conversation_id)
  WHERE conversation_id IS NOT NULL AND merged_into_ticket_id IS NULL;

-- 4) Extend tickets.status enum with 'reopened'.
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets
  ADD  CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY[
    'open','awaiting_customer','in_progress','resolved',
    'auto_resolved','guided','escalated','reopened'
  ]));

-- 5) Extend ticket_events.event_type with 'customer_replied' and 'merged_into'.
ALTER TABLE public.ticket_events
  DROP CONSTRAINT IF EXISTS ticket_events_event_type_check;
ALTER TABLE public.ticket_events
  ADD  CONSTRAINT ticket_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'reply_sent','internal_note','status_change','assignment',
    'merge','ai_classified','human_classified','ai_proposal',
    'ai_confirmed','ai_rejected','sla_breach','escalated','grouped',
    'classification_corrected','customer_replied','merged_into'
  ]));

COMMENT ON INDEX public.idx_conversations_account_channel_thread IS
  'KAI-165: 1 thread = 1 conversation, partial unique for thread-bearing rows.';
COMMENT ON INDEX public.idx_tickets_account_conversation_active IS
  'KAI-165: prevents concurrent ingestion from creating 2 tickets for the same conversation.';
