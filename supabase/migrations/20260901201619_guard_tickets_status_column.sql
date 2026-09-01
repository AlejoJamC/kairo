-- KAI-191. transitionTicketStatus() / apply_ticket_transition() was the only
-- *intended* writer of tickets.status, but nothing stopped a direct
-- `UPDATE tickets SET status = ...` from bypassing it entirely — no
-- validation against ticket_transition_rules, no ticket_state_history row,
-- not even a guarantee the value is one of the eight legal states. The
-- helper being "the only place allowed to write" was a TypeScript-layer
-- convention, not a guarantee.
--
-- This closes it at the database. apply_ticket_transition() marks its own
-- UPDATE with a transaction-local flag right before performing it and clears
-- the flag right after; a trigger on tickets rejects any change to status
-- where that flag is not set. set_config(..., is_local => true) scopes the
-- flag to the current transaction, so it never leaks across connections in a
-- pooled setup and never survives past the statement that needs it.

CREATE OR REPLACE FUNCTION "public"."guard_tickets_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('kairo.allow_status_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'tickets.status can only be changed through apply_ticket_transition()'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "guard_tickets_status_change"
    BEFORE UPDATE ON "public"."tickets"
    FOR EACH ROW EXECUTE FUNCTION "public"."guard_tickets_status_change"();

CREATE OR REPLACE FUNCTION "public"."apply_ticket_transition"("p_ticket_id" "uuid", "p_to_state" "text", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_actor_ref" "text", "p_trigger" "text", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") RETURNS TABLE("outcome" "text", "from_state" "text", "to_state" "text", "history_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
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

  v_history_from_state := CASE WHEN v_is_creation THEN NULL ELSE v_from_state END;

  IF NOT v_is_creation AND v_from_state IS NOT DISTINCT FROM p_to_state THEN
    RETURN QUERY SELECT 'no_op'::text, v_from_state, p_to_state, NULL::uuid;
    RETURN;
  END IF;

  IF v_history_from_state IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.ticket_transition_rules r
    WHERE r.from_state = v_history_from_state
      AND r.to_state = p_to_state
  ) THEN
    RAISE EXCEPTION 'apply_ticket_transition: illegal transition from % to % for ticket %', v_history_from_state, p_to_state, p_ticket_id
      USING ERRCODE = 'KA409';
  END IF;

  -- The only place in the codebase allowed to set this flag. It is
  -- transaction-local (is_local => true) and cleared immediately after the
  -- UPDATE, so no other statement in the same transaction inherits it.
  PERFORM set_config('kairo.allow_status_change', 'true', true);

  UPDATE public.tickets
     SET status = p_to_state
   WHERE id = p_ticket_id;

  PERFORM set_config('kairo.allow_status_change', 'false', true);

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
    RETURN QUERY SELECT 'no_op'::text, v_history_from_state, p_to_state, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'applied'::text, v_history_from_state, p_to_state, v_history_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- KAI-191 decision 3, the other half. A customer replying to a closed ticket
-- never reaches transitionTicketStatus() at all today — applyCustomerReplyTransition
-- only computes a candidate target for 'awaiting_customer' and 'resolved',
-- so a reply on 'closed' leaves no record anywhere, and a customer contacting
-- a closed case is signal, not noise. Give the activity log the event type
-- for it; the application-code change that emits it ships alongside this
-- migration.
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."ticket_activity_log"
    DROP CONSTRAINT "ticket_activity_log_event_type_check";

ALTER TABLE "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_event_type_check"
    CHECK (("event_type" = ANY (ARRAY[
        'assignment'::"text", 'merge'::"text", 'merged_into'::"text",
        'grouped'::"text", 'sla_breach'::"text", 'escalated'::"text",
        'out_of_hours_auto_reply'::"text", 'customer_reply_on_closed_ticket'::"text"
    ])));
