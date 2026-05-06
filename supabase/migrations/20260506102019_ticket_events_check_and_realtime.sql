-- KAI-27: ticket_events — add event_type CHECK constraint + enable Realtime
-- Table was created in 003_kairo_core_schema. This migration closes the two
-- remaining acceptance criteria: constrained event_type and Realtime support.

ALTER TABLE public.ticket_events
  ADD CONSTRAINT ticket_events_event_type_check CHECK (
    event_type IN (
      'reply',
      'internal_note',
      'status_change',
      'assignment',
      'merge',
      'ai_proposal',
      'ai_confirmed',
      'ai_rejected',
      'sla_breach'
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_events;
