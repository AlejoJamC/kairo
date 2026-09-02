-- KAI-191: every event_type ticket_events ever carried has now moved out.
--
-- reply_sent and customer_replied are dropped outright — both were pointer
-- events duplicating a fact `messages` already holds (a reply/customer
-- message is its own row there, with its own timestamp). Nothing replaces
-- them.
--
-- ai_classified, human_classified, ai_proposal, ai_confirmed, ai_rejected
-- and classification_corrected move to ticket_classification_history — a
-- judgement about a ticket's attributes belongs in the append-only
-- classification ledger, not in ticket_events.
--
-- That leaves the CHECK constraint with no values to allow. An empty
-- ARRAY[]::text[] is valid CHECK SQL, and since event_type is NOT NULL it
-- makes every future insert fail — the constraint doubles as a guard against
-- anything writing here again. ticket_events itself stays in place; dropping
-- the table is a separate follow-up.
ALTER TABLE "public"."ticket_events"
    DROP CONSTRAINT "ticket_events_event_type_check";

ALTER TABLE "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_event_type_check" CHECK (("event_type" = ANY (ARRAY[]::"text"[])));
