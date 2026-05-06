-- KAI-28: expand ticket_events.event_type CHECK constraint
-- Replaces the constraint from KAI-27 to cover all KAI-28 action types.
-- Two emitter entities (AI vs human) require distinct classification events.
-- Table has no data yet — safe to drop and recreate.

ALTER TABLE public.ticket_events
  DROP CONSTRAINT ticket_events_event_type_check;

ALTER TABLE public.ticket_events
  ADD CONSTRAINT ticket_events_event_type_check CHECK (
    event_type IN (
      'reply_sent',       -- agent sent a reply to the client
      'internal_note',    -- internal comment, not visible to client
      'status_change',    -- ticket status updated
      'assignment',       -- ticket assigned to an agent
      'merge',            -- ticket merged into another
      'ai_classified',    -- AI classified the ticket autonomously
      'human_classified', -- agent classified the ticket manually
      'ai_proposal',      -- AI proposed a classification (pending review)
      'ai_confirmed',     -- agent confirmed an AI proposal
      'ai_rejected',      -- agent rejected an AI proposal
      'sla_breach',       -- SLA deadline was missed
      'escalated',        -- ticket escalated
      'grouped'           -- ticket added to a group
    )
  );
