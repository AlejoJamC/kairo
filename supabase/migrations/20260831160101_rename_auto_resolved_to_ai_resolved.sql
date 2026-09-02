-- KAI-191 — rename ticket status 'auto_resolved' to 'ai_resolved'.
-- 'auto' became ambiguous once an upcoming automatic closure-by-timeout
-- status (also "auto", but not an AI judgement) is introduced. The codebase
-- already uses the 'ai_' prefix for this idea elsewhere (ticket_events:
-- ai_classified, ai_proposal, ai_confirmed, ai_rejected).

ALTER TABLE public.tickets
  DROP CONSTRAINT tickets_status_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY[
    'open'::text,
    'awaiting_customer'::text,
    'in_progress'::text,
    'resolved'::text,
    'ai_resolved'::text,
    'escalated'::text,
    'reopened'::text
  ]));
