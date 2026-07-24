-- KAI-108 — find_similar_tickets: p_status_filter acepta una lista de estados.
--
-- Contexto: GET /v1/tickets/:id/related-history filtraba por status = 'resolved'
-- exacto, así que los tickets auto-resueltos (estado final, agrupados junto a
-- 'resolved' bajo el menú "Resuelto" del aside) nunca aparecían como contexto
-- histórico. Ambos son estados finales y ambos deben poder consultarse.
--
-- Cambio: el predicado de estado pasa de igualdad exacta a pertenencia sobre
-- una lista separada por comas. Backward-compatible — un solo valor
-- ('resolved') sigue comportándose igual, y NULL sigue significando "sin
-- filtro". La firma y el RETURNS TABLE no cambian, así que basta
-- CREATE OR REPLACE (sin DROP, sin regrant).

CREATE OR REPLACE FUNCTION "public"."find_similar_tickets"(
  "p_ticket_id" "uuid",
  "p_account_id" "uuid",
  "p_limit" integer DEFAULT 5,
  "p_threshold" double precision DEFAULT 0.75,
  "p_status_filter" "text" DEFAULT NULL::"text",
  "p_exclude_same_group" boolean DEFAULT false
) RETURNS TABLE(
  "ticket_id" "uuid",
  "subject" "text",
  "resolved_at" timestamp with time zone,
  "resolution_summary" "text",
  "ticket_number" bigint,
  "similarity" double precision,
  "group_id" "uuid"
)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT
    t.id              AS ticket_id,
    t.subject,
    t.resolved_at,
    t.resolution_summary,
    t.ticket_number,
    1 - (t.embedding <=> (SELECT embedding FROM public.tickets WHERE id = p_ticket_id)) AS similarity,
    t.group_id
  FROM public.tickets t
  WHERE t.account_id = p_account_id
    AND t.id         <> p_ticket_id
    AND t.embedding  IS NOT NULL
    AND (
      p_status_filter IS NULL
      OR t.status = ANY(string_to_array(p_status_filter, ','))
    )
    AND (
      NOT p_exclude_same_group
      OR (SELECT group_id FROM public.tickets WHERE id = p_ticket_id) IS NULL
      OR t.group_id IS DISTINCT FROM (SELECT group_id FROM public.tickets WHERE id = p_ticket_id)
    )
    AND 1 - (t.embedding <=> (SELECT embedding FROM public.tickets WHERE id = p_ticket_id)) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;
