-- KAI-191 — rename ticket status 'auto_resolved' to 'ai_resolved'.
--
-- Pure rename, no behaviour change. 'auto' became ambiguous once an upcoming
-- automatic closure-by-timeout status (also "auto", but not an AI judgement)
-- is introduced. The codebase already uses the 'ai_' prefix for exactly this
-- idea elsewhere (ticket_events: ai_classified, ai_proposal, ai_confirmed,
-- ai_rejected).
--
-- No rows carry 'auto_resolved' today; the UPDATE below is defensive only.

UPDATE public.tickets
SET status = 'ai_resolved'
WHERE status = 'auto_resolved';

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
