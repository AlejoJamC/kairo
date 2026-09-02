-- KAI-191: ticket_state_history is the only place a state transition lives,
-- so status_change stops being written to ticket_events (it was a second
-- copy of the same fact). assignment, merge, merged_into, grouped and
-- escalated move to ticket_activity_log, the new home for residual ticket
-- facts. sla_breach is declared but nothing has ever written it — it goes
-- too. ticket_events keeps only reply_sent, internal_note, the six
-- classification event types, and customer_replied.

ALTER TABLE "public"."ticket_events"
    DROP CONSTRAINT "ticket_events_event_type_check";

ALTER TABLE "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_event_type_check" CHECK (("event_type" = ANY (ARRAY[
        'reply_sent'::"text",
        'internal_note'::"text",
        'ai_classified'::"text",
        'human_classified'::"text",
        'ai_proposal'::"text",
        'ai_confirmed'::"text",
        'ai_rejected'::"text",
        'classification_corrected'::"text",
        'customer_replied'::"text"
    ])));
