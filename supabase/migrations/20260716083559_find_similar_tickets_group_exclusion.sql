-- KAI-108 (tanda 2) — find_similar_tickets: exclusión opt-in de tickets que ya
-- comparten grupo con el ticket consultado + exponer group_id en el resultado.
--
-- Contexto: GET /v1/tickets/:id/similar sugería agrupar tickets que YA estaban
-- en el mismo grupo (loop infinito de sugerencias en el dashboard). El fix
-- frontend filtra contra el store, pero solo cubre tickets cargados; este
-- predicado lo resuelve en la fuente para cualquier candidato.
--
-- Cambios (backward-compatible para los demás call sites):
--   1. Nuevo parámetro p_exclude_same_group boolean DEFAULT false — solo la
--      ruta /similar lo activa; related-history, suggest-reply y client-profile
--      conservan su semántica actual sin tocar sus llamadas.
--   2. Nueva columna group_id en RETURNS TABLE — permite al cliente filtrar
--      candidatos fuera de su store.
--
-- El cambio de RETURNS TABLE exige DROP + CREATE (no basta CREATE OR REPLACE).

DROP FUNCTION IF EXISTS "public"."find_similar_tickets"("uuid", "uuid", integer, double precision, "text");

CREATE FUNCTION "public"."find_similar_tickets"(
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
    AND (p_status_filter IS NULL OR t.status = p_status_filter)
    AND (
      NOT p_exclude_same_group
      OR (SELECT group_id FROM public.tickets WHERE id = p_ticket_id) IS NULL
      OR t.group_id IS DISTINCT FROM (SELECT group_id FROM public.tickets WHERE id = p_ticket_id)
    )
    AND 1 - (t.embedding <=> (SELECT embedding FROM public.tickets WHERE id = p_ticket_id)) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

ALTER FUNCTION "public"."find_similar_tickets"("uuid", "uuid", integer, double precision, "text", boolean) OWNER TO "postgres";
