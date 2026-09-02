-- KAI-191 — add 'closed' as the ticket status model's only terminal state.
-- Nothing writes 'closed' yet (that's KAI-182); this migration only widens
-- the allowed values so the application layer can start enforcing the
-- resolved/ai_resolved -> closed transition rule.
alter table "public"."tickets"
  drop constraint "tickets_status_check";

alter table "public"."tickets"
  add constraint "tickets_status_check"
  check (
    status = any (
      array[
        'open'::text,
        'awaiting_customer'::text,
        'in_progress'::text,
        'resolved'::text,
        'ai_resolved'::text,
        'escalated'::text,
        'reopened'::text,
        'closed'::text
      ]
    )
  );
