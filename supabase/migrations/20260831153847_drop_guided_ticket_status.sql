-- KAI-191 — drop the unreachable 'guided' ticket status.
-- No code path has ever written this value; this removes it from the
-- allowed set. All other seven values and the rest of the constraint are
-- unchanged from what is in supabase/schema.sql today.
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets
  ADD  CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY[
    'open','awaiting_customer','in_progress','resolved',
    'auto_resolved','escalated','reopened'
  ]));
