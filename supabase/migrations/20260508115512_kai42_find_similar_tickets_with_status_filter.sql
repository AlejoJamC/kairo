-- KAI-42: extend find_similar_tickets() with optional status filter and richer
-- return shape so callers can render past resolved cases without an extra join.
--
-- Existing routes (related-history, suggest-reply) already pass `p_status_filter`
-- and read `subject`, `resolved_at`, `resolution_summary`, `ticket_number` from
-- the result — they were silently broken against the old signature. This
-- migration makes the RPC match the call sites.
--
-- Default threshold lowered from 0.80 → 0.75 to match KAI-42 acceptance criteria.

DROP FUNCTION IF EXISTS public.find_similar_tickets(uuid, uuid, integer, double precision);

CREATE OR REPLACE FUNCTION public.find_similar_tickets(
  p_ticket_id     UUID,
  p_user_id       UUID,
  p_limit         INTEGER          DEFAULT 5,
  p_threshold     DOUBLE PRECISION DEFAULT 0.75,
  p_status_filter TEXT             DEFAULT NULL
)
RETURNS TABLE(
  ticket_id          UUID,
  subject            TEXT,
  resolved_at        TIMESTAMPTZ,
  resolution_summary TEXT,
  ticket_number      BIGINT,
  similarity         DOUBLE PRECISION
)
LANGUAGE SQL STABLE
SET search_path = public, extensions
AS $$
  SELECT
    t.id                                              AS ticket_id,
    t.subject                                         AS subject,
    t.resolved_at                                     AS resolved_at,
    t.resolution_summary                              AS resolution_summary,
    t.ticket_number                                   AS ticket_number,
    1 - (t.embedding <=> source.embedding)            AS similarity
  FROM tickets t,
    (SELECT embedding FROM tickets WHERE id = p_ticket_id) AS source
  WHERE t.user_id = p_user_id
    AND t.id != p_ticket_id
    AND t.embedding IS NOT NULL
    AND source.embedding IS NOT NULL
    AND 1 - (t.embedding <=> source.embedding) > p_threshold
    AND (p_status_filter IS NULL OR t.status = p_status_filter)
  ORDER BY t.embedding <=> source.embedding
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.find_similar_tickets(uuid, uuid, integer, double precision, text)
  TO anon, authenticated, service_role;
