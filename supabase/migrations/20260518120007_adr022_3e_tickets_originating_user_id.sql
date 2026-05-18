-- ADR-022 Sub-fase 3e: tickets — rename user_id to originating_user_id (nullable)
-- This is the highest-risk sub-phase. Executed last.
-- user_id → originating_user_id (nullable, ON DELETE SET NULL)
-- Recreate indexes using account_id.
-- Update stored procedures that filtered by user_id to use account_id.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop old user_id indexes
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_tickets_user_id;
DROP INDEX IF EXISTS public.idx_tickets_priority_score;
DROP INDEX IF EXISTS public.idx_tickets_auto_replied_thread;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rename column + change constraint
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tickets
  RENAME COLUMN user_id TO originating_user_id;

ALTER TABLE public.tickets
  ALTER COLUMN originating_user_id DROP NOT NULL;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_user_id_fkey;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_originating_user_id_fkey
  FOREIGN KEY (originating_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Recreate indexes on account_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_tickets_account_priority_score
  ON public.tickets (account_id, priority_score DESC NULLS LAST);

CREATE INDEX idx_tickets_auto_replied_thread
  ON public.tickets (account_id, gmail_thread_id)
  WHERE auto_replied_out_of_hours = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update stored procedures to accept p_account_id instead of p_user_id
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sidebar_counts(p_account_id uuid)
RETURNS TABLE(status text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT status, COUNT(*) AS count
  FROM public.tickets
  WHERE account_id = p_account_id
  GROUP BY status;
$$;

CREATE OR REPLACE FUNCTION public.find_similar_tickets(
  p_ticket_id      uuid,
  p_account_id     uuid,
  p_limit          integer         DEFAULT 5,
  p_threshold      double precision DEFAULT 0.75,
  p_status_filter  text            DEFAULT NULL
)
RETURNS TABLE(
  ticket_id         uuid,
  subject           text,
  resolved_at       timestamptz,
  resolution_summary text,
  ticket_number     bigint,
  similarity        double precision
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.id              AS ticket_id,
    t.subject,
    t.resolved_at,
    t.resolution_summary,
    t.ticket_number,
    1 - (t.embedding <=> (SELECT embedding FROM public.tickets WHERE id = p_ticket_id)) AS similarity
  FROM public.tickets t
  WHERE t.account_id = p_account_id
    AND t.id         <> p_ticket_id
    AND t.embedding  IS NOT NULL
    AND (p_status_filter IS NULL OR t.status = p_status_filter)
    AND 1 - (t.embedding <=> (SELECT embedding FROM public.tickets WHERE id = p_ticket_id)) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_classification_accuracy(
  p_account_id uuid,
  p_window     text DEFAULT '30d'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_interval interval;
  v_result   jsonb;
BEGIN
  v_interval := CASE p_window
    WHEN '7d'  THEN '7 days'::interval
    WHEN '30d' THEN '30 days'::interval
    WHEN '90d' THEN '90 days'::interval
    ELSE            '30 days'::interval
  END;

  SELECT jsonb_build_object(
    'total_classified', COUNT(*),
    'with_feedback',    COUNT(cf.id),
    'corrections',      COUNT(cf.id) FILTER (WHERE cf.is_correction),
    'accuracy_rate',    ROUND(
      (COUNT(cf.id) - COUNT(cf.id) FILTER (WHERE cf.is_correction))::numeric
      / NULLIF(COUNT(cf.id), 0) * 100, 2
    )
  )
  INTO v_result
  FROM public.tickets t
  LEFT JOIN public.categorization_feedback cf ON cf.ticket_id = t.id
  WHERE t.account_id   = p_account_id
    AND t.classified_at >= now() - v_interval;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.find_relevant_kb(
  p_query_embedding extensions.vector,
  p_account_id      uuid,
  p_limit           integer DEFAULT 3
)
RETURNS TABLE(article_id uuid, title text, similarity double precision)
LANGUAGE sql STABLE
AS $$
  SELECT
    id         AS article_id,
    title,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM public.kb_articles
  WHERE account_id = p_account_id
    AND is_published = true
    AND embedding IS NOT NULL
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;
