-- KAI-191 (follow-up) — the out-of-hours auto-reply (apps/api/src/lib/
-- out-of-hours-reply.ts) sends a customer-facing message and flips
-- tickets.auto_replied_out_of_hours / auto_replied_at but never wrote a fact
-- to ticket_activity_log, so it had zero trace in ticket_lifecycle_timeline.
-- It doesn't change tickets.status, so it isn't a transitionTicketStatus()
-- concern — it's a residual ticket fact, same shape as assignment/merge/
-- merged_into/grouped/sla_breach/escalated. Add a new domain/event_type pair
-- so out-of-hours-reply.ts can call emitTicketActivity() right where it sets
-- those two columns.

ALTER TABLE "public"."ticket_activity_log"
    DROP CONSTRAINT "ticket_activity_log_domain_check";

ALTER TABLE "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_domain_check"
    CHECK (("domain" = ANY (ARRAY['tickets'::"text", 'deduplication'::"text", 'grouping'::"text", 'ans'::"text", 'escalation'::"text", 'messaging'::"text"])));

ALTER TABLE "public"."ticket_activity_log"
    DROP CONSTRAINT "ticket_activity_log_event_type_check";

ALTER TABLE "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_event_type_check"
    CHECK (("event_type" = ANY (ARRAY['assignment'::"text", 'merge'::"text", 'merged_into'::"text", 'grouped'::"text", 'sla_breach'::"text", 'escalated'::"text", 'out_of_hours_auto_reply'::"text"])));
