-- KAI-191 — ticket_lifecycle_timeline: the single ordered stream that used
-- to be assembled ad hoc from ticket_events. Each of ticket_events' former
-- responsibilities now lives in a purpose-shaped table (ticket_state_history,
-- ticket_activity_log, ticket_notes, ticket_classification_history) or in
-- `messages`, joined through `ticket_messages`. This view unions those five
-- sources back into one per-ticket stream, ordered by occurred_at at query
-- time, so no endpoint has to reassemble it from five queries by hand — that
-- reassembly-by-hand is exactly how ticket_events became a junk drawer.
--
-- `security_invoker` so RLS on the five underlying tables (all account-scoped
-- via current_account_id(), directly or through ticket_messages -> messages)
-- applies to whoever queries the view, not to the view's owner.
--
-- actor_ref: ticket_state_history / ticket_activity_log /
-- ticket_classification_history each carry both actor_user_id (a real user)
-- and actor_ref (a free-text ref for a non-human actor, e.g. a pipeline
-- name). The view has one actor_ref column, so it's
-- COALESCE(actor_ref, actor_user_id::text) — whichever of the two that row
-- actually used.
CREATE OR REPLACE VIEW "public"."ticket_lifecycle_timeline"
WITH ("security_invoker" = "true") AS
SELECT
    "h"."account_id",
    "h"."ticket_id",
    "h"."occurred_at",
    'state_change'::"text" AS "kind",
    "h"."actor_type",
    COALESCE("h"."actor_ref", "h"."actor_user_id"::"text") AS "actor_ref",
    CASE
        WHEN "h"."from_state" IS NULL THEN "h"."to_state"
        ELSE "h"."from_state" || ' → ' || "h"."to_state"
    END AS "detail"
FROM "public"."ticket_state_history" "h"

UNION ALL

SELECT
    "a"."account_id",
    "a"."ticket_id",
    "a"."occurred_at",
    'activity'::"text" AS "kind",
    "a"."actor_type",
    COALESCE("a"."actor_ref", "a"."actor_user_id"::"text") AS "actor_ref",
    "a"."event_type" AS "detail"
FROM "public"."ticket_activity_log" "a"

UNION ALL

SELECT
    "n"."account_id",
    "n"."ticket_id",
    "n"."created_at" AS "occurred_at",
    'note'::"text" AS "kind",
    'human'::"text" AS "actor_type",
    "n"."author_id"::"text" AS "actor_ref",
    CASE
        WHEN "length"("n"."body") > 140 THEN "left"("n"."body", 140) || '…'
        ELSE "n"."body"
    END AS "detail"
FROM "public"."ticket_notes" "n"

UNION ALL

SELECT
    "c"."account_id",
    "c"."ticket_id",
    "c"."occurred_at",
    'classification'::"text" AS "kind",
    "c"."actor_type",
    COALESCE("c"."actor_ref", "c"."actor_user_id"::"text") AS "actor_ref",
    "c"."dimension" || ': ' || COALESCE("c"."from_value", '—') || ' → ' || COALESCE("c"."to_value", '—') AS "detail"
FROM "public"."ticket_classification_history" "c"

UNION ALL

SELECT
    "m"."account_id",
    "tm"."ticket_id",
    "m"."received_at" AS "occurred_at",
    'message'::"text" AS "kind",
    CASE WHEN "m"."direction" = 'inbound' THEN 'customer' ELSE 'human' END AS "actor_type",
    "m"."sender_display_name" AS "actor_ref",
    "m"."direction" AS "detail"
FROM "public"."ticket_messages" "tm"
JOIN "public"."messages" "m" ON "m"."id" = "tm"."message_id";

COMMENT ON VIEW "public"."ticket_lifecycle_timeline" IS 'One ordered stream per ticket, unioning ticket_state_history, ticket_activity_log, ticket_notes, ticket_classification_history and messages (via ticket_messages). kind distinguishes the source (state_change/activity/note/classification/message); detail is a short per-source summary. Composed in SQL on purpose — never reassembled in an endpoint.';

GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "anon";
GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "service_role";

-- ---------------------------------------------------------------------------
-- Drop ticket_events. It has had zero writers and an empty CHECK constraint
-- since the previous two migrations in this set; every fact it used to hold
-- now lives in one of the five tables ticket_lifecycle_timeline unions above.
-- notifications and ticket_note_mentions were already repointed off it (at
-- ticket_notes instead) by 20260901191634_repoint_notes_to_ticket_notes.sql,
-- so nothing references this table anymore — a plain DROP is enough, no
-- CASCADE required.
-- ---------------------------------------------------------------------------

DROP TABLE "public"."ticket_events";
