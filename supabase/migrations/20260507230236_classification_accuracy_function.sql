-- KAI-125: get_classification_accuracy — per-tenant accuracy from classification_feedback
-- SECURITY DEFINER bypasses RLS; tenant isolation is enforced by p_user_id filter.
-- Same pattern as get_sidebar_counts and find_similar_tickets.

CREATE OR REPLACE FUNCTION public.get_classification_accuracy(
  p_user_id UUID,
  p_window  TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since            TIMESTAMPTZ;
  v_total_classified BIGINT;
  v_result           JSONB;
BEGIN
  -- Resolve time window (unknown values fall back to all-time)
  v_since := CASE p_window
    WHEN '7d'  THEN NOW() - INTERVAL '7 days'
    WHEN '30d' THEN NOW() - INTERVAL '30 days'
    ELSE        '-infinity'::TIMESTAMPTZ
  END;

  SELECT COUNT(*) INTO v_total_classified
  FROM public.tickets
  WHERE user_id      = p_user_id
    AND classified_at IS NOT NULL
    AND classified_at >= v_since;

  -- No classified tickets yet — return zero-state
  IF v_total_classified = 0 THEN
    RETURN jsonb_build_object(
      'total_classified', 0,
      'window',           p_window,
      'dimensions', jsonb_build_object(
        'priority',    NULL,
        'category',    NULL,
        'ticket_type', NULL,
        'sentiment',   NULL
      )
    );
  END IF;

  -- Aggregate corrections per dimension
  WITH c AS (
    SELECT
      SUM(CASE WHEN correct_priority    IS NOT NULL AND correct_priority    <> ai_priority    THEN 1 ELSE 0 END) AS n_priority,
      SUM(CASE WHEN correct_category    IS NOT NULL AND correct_category    <> ai_category    THEN 1 ELSE 0 END) AS n_category,
      SUM(CASE WHEN correct_ticket_type IS NOT NULL AND correct_ticket_type <> ai_ticket_type THEN 1 ELSE 0 END) AS n_ticket_type,
      SUM(CASE WHEN correct_sentiment   IS NOT NULL AND correct_sentiment   <> ai_sentiment   THEN 1 ELSE 0 END) AS n_sentiment
    FROM public.classification_feedback
    WHERE user_id    = p_user_id
      AND created_at >= v_since
  )
  SELECT jsonb_build_object(
    'total_classified', v_total_classified,
    'window',           p_window,
    'dimensions', jsonb_build_object(
      'priority',    jsonb_build_object('total_corrected', c.n_priority,    'accuracy', ROUND(1.0 - c.n_priority::NUMERIC    / v_total_classified, 4)),
      'category',    jsonb_build_object('total_corrected', c.n_category,    'accuracy', ROUND(1.0 - c.n_category::NUMERIC    / v_total_classified, 4)),
      'ticket_type', jsonb_build_object('total_corrected', c.n_ticket_type, 'accuracy', ROUND(1.0 - c.n_ticket_type::NUMERIC / v_total_classified, 4)),
      'sentiment',   jsonb_build_object('total_corrected', c.n_sentiment,   'accuracy', ROUND(1.0 - c.n_sentiment::NUMERIC   / v_total_classified, 4))
    )
  ) INTO v_result
  FROM c;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_classification_accuracy(UUID, TEXT) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.get_classification_accuracy(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_accuracy(UUID, TEXT) TO service_role;
