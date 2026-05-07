-- KAI-123: add classification_corrected to ticket_events CHECK constraint

ALTER TABLE public.ticket_events
  DROP CONSTRAINT ticket_events_event_type_check;

ALTER TABLE public.ticket_events
  ADD CONSTRAINT ticket_events_event_type_check CHECK (
    event_type IN (
      'reply_sent',
      'internal_note',
      'status_change',
      'assignment',
      'merge',
      'ai_classified',
      'human_classified',
      'ai_proposal',
      'ai_confirmed',
      'ai_rejected',
      'sla_breach',
      'escalated',
      'grouped',
      'classification_corrected'
    )
  );
