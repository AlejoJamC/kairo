-- KAI-232: per-ticket internal-note counters for the triage queue and the
-- ticket header (design spec surface A).
--
-- Computed at query time — deliberately NOT stored on `tickets`. The count is
-- derived state over an append-only event stream, so a denormalized column
-- would need a trigger on every note write and would drift the moment one is
-- deleted. Same shape and contract as `get_sidebar_counts`: a STABLE sql
-- function returning one row per ticket, called by the API per request.
--
-- `p_user_id` scopes `unread_mentions` to the caller: the queue's blue dot
-- means "you have an unread mention here", which is per-viewer, not per-ticket.

CREATE OR REPLACE FUNCTION "public"."get_ticket_note_counts"(
    "p_account_id" "uuid",
    "p_user_id" "uuid"
)
RETURNS TABLE("ticket_id" "uuid", "note_count" bigint, "unread_mentions" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    t.id AS ticket_id,
    COUNT(DISTINCT e.id) AS note_count,
    COUNT(DISTINCT m.id) FILTER (
      WHERE m.mentioned_user_id = p_user_id AND m.read_at IS NULL
    ) AS unread_mentions
  FROM public.tickets t
  JOIN public.ticket_events e
    ON e.ticket_id = t.id
   AND e.event_type = 'internal_note'
  LEFT JOIN public.ticket_note_mentions m
    ON m.ticket_event_id = e.id
   AND m.account_id = p_account_id
  WHERE t.account_id = p_account_id
  GROUP BY t.id;
$$;

ALTER FUNCTION "public"."get_ticket_note_counts"("uuid", "uuid") OWNER TO "postgres";
