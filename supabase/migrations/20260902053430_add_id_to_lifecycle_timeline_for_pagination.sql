-- KAI-191 fix. GET /:id/activity paginates ticket_lifecycle_timeline by
-- occurred_at alone. The view has five sources with no shared, globally
-- ordered secondary key, so two rows can legitimately share an identical
-- occurred_at — recordAiClassification() itself does this on purpose,
-- writing 'category' and 'priority' as two rows with the same timestamp in
-- one call. If that pair falls on a page boundary, `.lt("occurred_at", X)`
-- on the next page excludes everything at timestamp X, including whichever
-- of the pair didn't make it into the previous page — a silent, permanent
-- gap in the timeline with no error and no way to recover it from the
-- client.
--
-- Fix: expose each row's own id (already a real uuid primary key on every
-- source table) as a stable tie-break. It carries no meaning across
-- sources — a random uuid, not a timestamp — but cursor pagination doesn't
-- need one: it only needs a total order that never changes, so the same
-- boundary is never split across two pages.

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
    END AS "detail",
    "h"."id"
FROM "public"."ticket_state_history" "h"

UNION ALL

SELECT
    "a"."account_id",
    "a"."ticket_id",
    "a"."occurred_at",
    'activity'::"text" AS "kind",
    "a"."actor_type",
    COALESCE("a"."actor_ref", "a"."actor_user_id"::"text") AS "actor_ref",
    "a"."event_type" AS "detail",
    "a"."id"
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
    END AS "detail",
    "n"."id"
FROM "public"."ticket_notes" "n"

UNION ALL

SELECT
    "c"."account_id",
    "c"."ticket_id",
    "c"."occurred_at",
    'classification'::"text" AS "kind",
    "c"."actor_type",
    COALESCE("c"."actor_ref", "c"."actor_user_id"::"text") AS "actor_ref",
    "c"."dimension" || ': ' || COALESCE("c"."from_value", '—') || ' → ' || COALESCE("c"."to_value", '—') AS "detail",
    "c"."id"
FROM "public"."ticket_classification_history" "c"

UNION ALL

SELECT
    "m"."account_id",
    "tm"."ticket_id",
    "m"."received_at" AS "occurred_at",
    'message'::"text" AS "kind",
    CASE WHEN "m"."direction" = 'inbound' THEN 'customer' ELSE 'human' END AS "actor_type",
    "m"."sender_display_name" AS "actor_ref",
    "m"."direction" AS "detail",
    "m"."id"
FROM "public"."ticket_messages" "tm"
JOIN "public"."messages" "m" ON "m"."id" = "tm"."message_id";

COMMENT ON VIEW "public"."ticket_lifecycle_timeline" IS 'One ordered stream per ticket, unioning ticket_state_history, ticket_activity_log, ticket_notes, ticket_classification_history and messages (via ticket_messages). kind distinguishes the source (state_change/activity/note/classification/message); detail is a short per-source summary; id is each row''s own source-table primary key, exposed only as a stable pagination tie-break for occurred_at ties — it carries no meaning across sources. Composed in SQL on purpose — never reassembled in an endpoint.';

GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "anon";
GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "service_role";
