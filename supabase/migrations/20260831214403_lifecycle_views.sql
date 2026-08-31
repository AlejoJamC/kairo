-- KAI-191 — lifecycle views built on top of ticket_state_history.
--
-- The timeline is composed here, in the database, via window functions over
-- ticket_state_history.seq — never assembled by joining/reducing rows inside
-- an API handler. Both views are `security_invoker` so RLS on the
-- underlying table (account-scoped via current_account_id()) applies to
-- whoever queries the view, not to the view's owner.

-- ---------------------------------------------------------------------------
-- ticket_state_durations — per ticket, per state: when it was entered, when
-- it was left (NULL while the ticket is still in that state), and the
-- duration spent there (NULL for the same reason).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW "public"."ticket_state_durations"
WITH ("security_invoker" = "true") AS
SELECT
    "h"."account_id",
    "h"."ticket_id",
    "h"."seq",
    "h"."to_state" AS "state",
    "h"."occurred_at" AS "entered_at",
    "lead"("h"."occurred_at") OVER (PARTITION BY "h"."ticket_id" ORDER BY "h"."seq") AS "exited_at",
    "lead"("h"."occurred_at") OVER (PARTITION BY "h"."ticket_id" ORDER BY "h"."seq") - "h"."occurred_at" AS "duration"
FROM "public"."ticket_state_history" "h";

COMMENT ON VIEW "public"."ticket_state_durations" IS 'Per ticket, per state: entered_at/exited_at/duration derived from ticket_state_history via LEAD(occurred_at) OVER (PARTITION BY ticket_id ORDER BY seq). exited_at and duration are NULL for the state the ticket currently occupies.';

GRANT ALL ON TABLE "public"."ticket_state_durations" TO "anon";
GRANT ALL ON TABLE "public"."ticket_state_durations" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_state_durations" TO "service_role";

-- ---------------------------------------------------------------------------
-- ticket_transition_override_rates — how often a human transition
-- immediately follows one made by 'ai' or 'system' on the same ticket,
-- grouped by the (from_state, to_state) pair of that following transition.
--
-- override_rate = (how many of those following transitions were made by a
-- human) / (how many followed an ai/system transition at all), for that
-- from/to pair. This is the feedback signal: a high rate on a given pair
-- means humans are routinely correcting what Kairo decided on its own.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW "public"."ticket_transition_override_rates"
WITH ("security_invoker" = "true") AS
WITH "transitions" AS (
    SELECT
        "h"."account_id",
        "h"."ticket_id",
        "h"."seq",
        "h"."actor_type",
        "h"."from_state",
        "h"."to_state",
        "lag"("h"."actor_type") OVER (PARTITION BY "h"."ticket_id" ORDER BY "h"."seq") AS "prev_actor_type"
    FROM "public"."ticket_state_history" "h"
), "by_pair" AS (
    SELECT
        "t"."account_id",
        "t"."from_state",
        "t"."to_state",
        "count"(*) FILTER (WHERE "t"."prev_actor_type" IN ('ai', 'system')) AS "following_ai_or_system",
        "count"(*) FILTER (WHERE "t"."actor_type" = 'human' AND "t"."prev_actor_type" IN ('ai', 'system')) AS "overridden_by_human"
    FROM "transitions" "t"
    GROUP BY "t"."account_id", "t"."from_state", "t"."to_state"
)
SELECT
    "account_id",
    "from_state",
    "to_state",
    "following_ai_or_system",
    "overridden_by_human",
    CASE
        WHEN "following_ai_or_system" > 0
            THEN "round"("overridden_by_human"::numeric / "following_ai_or_system", 4)
        ELSE NULL
    END AS "override_rate"
FROM "by_pair";

COMMENT ON VIEW "public"."ticket_transition_override_rates" IS 'How often a human transition immediately follows one made by ai/system on the same ticket (LAG(actor_type) OVER ticket_id ORDER BY seq), grouped by the (from_state, to_state) pair of the following transition. override_rate = overridden_by_human / following_ai_or_system.';

GRANT ALL ON TABLE "public"."ticket_transition_override_rates" TO "anon";
GRANT ALL ON TABLE "public"."ticket_transition_override_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_transition_override_rates" TO "service_role";
