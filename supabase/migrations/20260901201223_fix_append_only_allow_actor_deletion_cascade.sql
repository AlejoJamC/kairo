-- KAI-191 fix. The append-only trigger on ticket_state_history,
-- ticket_activity_log and ticket_classification_history rejected every
-- UPDATE unconditionally — including the `ON DELETE SET NULL` cascade that
-- actor_user_id's own foreign key fires when a user account is deleted. So
-- deleting any user who had ever driven a transition failed outright
-- (insufficient_privilege), instead of nulling actor_user_id and leaving
-- actor_ref as the surviving identifier, which is the whole point of that
-- column (Decision 10: "actor_ref survives the deletion of a user account").
--
-- Fix: allow exactly the shape that cascade produces — actor_user_id going
-- from NOT NULL to NULL, with every other column unchanged — and continue to
-- reject anything else, including a caller setting actor_user_id to NULL by
-- hand alongside any other change. This is not a general-purpose UPDATE
-- allowance; it is a one-column, one-direction exception matched exactly.

CREATE OR REPLACE FUNCTION "public"."reject_ticket_state_history_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.actor_user_id IS NULL
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.account_id = OLD.account_id
     AND NEW.ticket_id = OLD.ticket_id
     AND NEW.seq = OLD.seq
     AND NEW.from_state IS NOT DISTINCT FROM OLD.from_state
     AND NEW.to_state = OLD.to_state
     AND NEW.actor_type = OLD.actor_type
     AND NEW.actor_ref IS NOT DISTINCT FROM OLD.actor_ref
     AND NEW."trigger" = OLD."trigger"
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.occurred_at = OLD.occurred_at
     AND NEW.recorded_at = OLD.recorded_at
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ticket_state_history is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."reject_ticket_activity_log_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.actor_user_id IS NULL
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.account_id = OLD.account_id
     AND NEW.ticket_id = OLD.ticket_id
     AND NEW.seq = OLD.seq
     AND NEW.domain = OLD.domain
     AND NEW.event_type = OLD.event_type
     AND NEW.actor_type = OLD.actor_type
     AND NEW.actor_ref IS NOT DISTINCT FROM OLD.actor_ref
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.occurred_at = OLD.occurred_at
     AND NEW.recorded_at = OLD.recorded_at
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ticket_activity_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."reject_ticket_classification_history_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.actor_user_id IS NULL
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.account_id = OLD.account_id
     AND NEW.ticket_id = OLD.ticket_id
     AND NEW.seq = OLD.seq
     AND NEW.actor_type = OLD.actor_type
     AND NEW.actor_ref IS NOT DISTINCT FROM OLD.actor_ref
     AND NEW.dimension = OLD.dimension
     AND NEW.from_value IS NOT DISTINCT FROM OLD.from_value
     AND NEW.to_value IS NOT DISTINCT FROM OLD.to_value
     AND NEW.confidence IS NOT DISTINCT FROM OLD.confidence
     AND NEW.model_version IS NOT DISTINCT FROM OLD.model_version
     AND NEW.occurred_at = OLD.occurred_at
     AND NEW.recorded_at = OLD.recorded_at
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ticket_classification_history is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
