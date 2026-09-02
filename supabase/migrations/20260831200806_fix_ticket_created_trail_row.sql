-- KAI-191 — fix: creation must never leave tickets.status NULL.
--
-- The first cut of apply_ticket_transition() relied on the caller inserting
-- the new ticket row with status=NULL, then calling this function to both
-- set status='open' AND record the from_state=NULL creation row atomically.
-- That made the INSERT and the RPC call two separate round trips with no
-- transaction spanning both: if the RPC call failed for any reason (network,
-- timeout, RPC error), the already-committed INSERT left the ticket with
-- status=NULL forever. A NULL-status ticket is invisible — `.not("status",
-- "in", (...))` and `.in("status", OPEN_STATUSES)` both evaluate to NULL
-- (not TRUE) against a NULL column, so the ticket vanishes from the inbox,
-- the ticket list, and the SLA escalation cron all at once.
--
-- Fix: the caller goes back to inserting status='open' directly (the ticket
-- is valid and visible the instant it exists), and this function special-cases
-- trigger='ticket_created' to always record the from_state=NULL trail row
-- regardless of the ticket's current status, with a harmless no-change
-- UPDATE of tickets.status alongside it. If the trail-row call now fails,
-- the ticket is still open and visible — only the t0 history row is
-- missing, which is the same (acceptable) degradation the pre-KAI-191 code
-- already had for every ticket.

CREATE OR REPLACE FUNCTION "public"."apply_ticket_transition"(
    "p_ticket_id" "uuid",
    "p_to_state" "text",
    "p_actor_type" "text",
    "p_actor_user_id" "uuid",
    "p_actor_ref" "text",
    "p_trigger" "text",
    "p_reason" "text",
    "p_metadata" "jsonb",
    "p_idempotency_key" "text"
) RETURNS TABLE("outcome" "text", "from_state" "text", "to_state" "text", "history_id" "uuid")
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_from_state         text;
  v_account_id         uuid;
  v_history_id         uuid;
  v_is_creation        boolean;
  v_history_from_state text;
BEGIN
  SELECT t.status, t.account_id
    INTO v_from_state, v_account_id
  FROM public.tickets t
  WHERE t.id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_ticket_transition: ticket % not found', p_ticket_id
      USING ERRCODE = 'KA404';
  END IF;

  v_is_creation := (p_trigger = 'ticket_created');

  -- For a creation trail row, the ticket's current status was already set
  -- directly by the caller's INSERT (normally 'open') — it is not a real
  -- prior state, so the history row must record from_state=NULL regardless
  -- of what tickets.status currently holds.
  v_history_from_state := CASE WHEN v_is_creation THEN NULL ELSE v_from_state END;

  -- Same-state request: no-op, not an error. Does NOT apply to
  -- trigger='ticket_created' — that call must always record its trail row
  -- even though tickets.status already equals p_to_state (it was set
  -- directly by the INSERT, not by a prior call to this function).
  IF NOT v_is_creation AND v_from_state IS NOT DISTINCT FROM p_to_state THEN
    RETURN QUERY SELECT 'no_op'::text, v_from_state, p_to_state, NULL::uuid;
    RETURN;
  END IF;

  -- v_history_from_state = NULL either for a creation row (always) or for a
  -- ticket whose status is genuinely NULL (shouldn't happen post-fix, but
  -- harmless to allow) — that transition has no rule to look up and is
  -- always legal. Every other from_state must be validated.
  IF v_history_from_state IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.ticket_transition_rules r
    WHERE r.from_state = v_history_from_state
      AND r.to_state = p_to_state
  ) THEN
    RAISE EXCEPTION 'apply_ticket_transition: illegal transition from % to % for ticket %', v_history_from_state, p_to_state, p_ticket_id
      USING ERRCODE = 'KA409';
  END IF;

  -- For creation this is a harmless no-change write (status is already
  -- p_to_state); for every other trigger it is the real transition.
  UPDATE public.tickets
     SET status = p_to_state
   WHERE id = p_ticket_id;

  INSERT INTO public.ticket_state_history (
    account_id, ticket_id, from_state, to_state, actor_type, actor_user_id,
    actor_ref, trigger, reason, occurred_at, metadata, idempotency_key
  ) VALUES (
    v_account_id, p_ticket_id, v_history_from_state, p_to_state, p_actor_type, p_actor_user_id,
    p_actor_ref, p_trigger, p_reason, now(), p_metadata, p_idempotency_key
  )
  ON CONFLICT ON CONSTRAINT ticket_state_history_account_id_idempotency_key_key DO NOTHING
  RETURNING id INTO v_history_id;

  IF v_history_id IS NULL THEN
    -- Only reachable when p_idempotency_key was non-null and already recorded
    -- (the unique constraint ignores NULL idempotency_key entirely). The
    -- status UPDATE above still ran, but it applied the same value another
    -- request already committed, so treat this as a no-op rather than raise.
    RETURN QUERY SELECT 'no_op'::text, v_history_from_state, p_to_state, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'applied'::text, v_history_from_state, p_to_state, v_history_id;
END;
$$;
