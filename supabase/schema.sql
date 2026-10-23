


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."draft_contact_origin" AS ENUM (
    'kairo_created',
    'external_synced'
);


ALTER TYPE "public"."draft_contact_origin" OWNER TO "postgres";


CREATE TYPE "public"."draft_contact_status" AS ENUM (
    'proposed',
    'confirmed',
    'rejected',
    'merged_into'
);


ALTER TYPE "public"."draft_contact_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_assert_draft_access"("p_draft_id" "uuid") RETURNS TABLE("account_id" "uuid", "draft_status" "public"."draft_contact_status", "draft_origin" "public"."draft_contact_origin")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_account_id uuid;
  v_status     public.draft_contact_status;
  v_origin     public.draft_contact_origin;
BEGIN
  SELECT d.account_id, d.status, d.origin
    INTO v_account_id, v_status, v_origin
  FROM public.draft_contact d
  WHERE d.id = p_draft_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'draft not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.account_members am
    WHERE am.account_id = v_account_id
      AND am.user_id = auth.uid()
      AND am.status = 'active'
  ) THEN
    RAISE EXCEPTION 'forbidden: not a member of draft account' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY SELECT v_account_id, v_status, v_origin;
END;
$$;


ALTER FUNCTION "public"."_assert_draft_access"("p_draft_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."account_effective_seat_limit"("p_account_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT COALESCE(a.seat_limit, p.seat_limit_default)
    FROM public.accounts a
    JOIN public.plans p ON p.id = a.plan_id
    WHERE a.id = p_account_id;
$$;


ALTER FUNCTION "public"."account_effective_seat_limit"("p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_case_revision"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF ROW(NEW.assigned_to, NEW.priority, NEW.category, NEW.status, NEW.model_verdict, NEW.body_plain, NEW.human_modified_at)
     IS DISTINCT FROM ROW(OLD.assigned_to, OLD.priority, OLD.category, OLD.status, OLD.model_verdict, OLD.body_plain, OLD.human_modified_at) THEN NEW.case_revision := OLD.case_revision + 1; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."advance_case_revision"() OWNER TO "postgres";


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

  -- A ticket is genuinely being created exactly when it has no prior rows in
  -- ticket_state_history — that fact lives in the table being written, not
  -- in a string the caller happens to pass. (Not `p_trigger = 'ticket_created'`:
  -- trigger is caller-supplied free text, and keying creation-detection off
  -- it would let any future caller bypass both the no-op guard and the
  -- ticket_transition_rules check below by reusing that string against an
  -- existing ticket.)
  v_is_creation := NOT EXISTS (
    SELECT 1 FROM public.ticket_state_history WHERE ticket_id = p_ticket_id
  );

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


ALTER FUNCTION "public"."apply_ticket_transition"("p_ticket_id" "uuid", "p_to_state" "text", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_actor_ref" "text", "p_trigger" "text", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_confirm_drafts_by_organization"("p_organization" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_account_id uuid;
  v_count      integer;
BEGIN
  v_account_id := public.current_account_id();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: no active account' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Update proposed drafts matching the org for this account
  WITH updated AS (
    UPDATE public.draft_contact
       SET status       = 'confirmed',
           confirmed_at = now(),
           confirmed_by = auth.uid()
     WHERE account_id   = v_account_id
       AND organization = p_organization
       AND status       = 'proposed'
     RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;

  -- Audit log rows in the same transaction
  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action, diff)
  SELECT d.id, d.account_id, auth.uid(), 'confirmed', jsonb_build_object('bulk_by_organization', p_organization)
  FROM public.draft_contact d
  WHERE d.account_id   = v_account_id
    AND d.organization = p_organization
    AND d.confirmed_at >= now() - interval '5 seconds'
    AND d.confirmed_by = auth.uid();

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."bulk_confirm_drafts_by_organization"("p_organization" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_ticket_decision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE c text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.model_verdict IS NOT DISTINCT FROM OLD.model_verdict THEN RETURN NEW; END IF;
  END IF;
  c := CASE WHEN NEW.classification_tier = 1 THEN 'onboarding_triage' WHEN NEW.classification_tier IN (2,3) THEN 'historical_learning' ELSE 'incoming_email_decision' END;
  INSERT INTO ticket_decision_history(account_id, ticket_id, contract, contract_version, case_revision, status, result, idempotency_key)
  VALUES (NEW.account_id, NEW.id, c, COALESCE(NEW.model_verdict->'workflow'->>'version','legacy'), NEW.case_revision,
    'proposed', jsonb_build_object('verdict',NEW.model_verdict,'promptVersion',NEW.prompt_version,'derivationVersion',NEW.derivation_version,'missing',COALESCE(NEW.model_verdict->'evidence'->'missing','[]'::jsonb),'authorization','human_review'),
    'classification:' || NEW.id || ':' || NEW.case_revision) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."capture_ticket_decision"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."decision_work_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid",
    "message_id" "uuid",
    "knowledge_version_id" "uuid",
    "contract" "text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "first_failed_at" timestamp with time zone,
    "requeued_at" timestamp with time zone,
    "requeued_by" "uuid",
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "decision_work_items_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "decision_work_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."decision_work_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_decision_work"("p_limit" integer DEFAULT 10, "p_max_attempts" integer DEFAULT 6) RETURNS SETOF "public"."decision_work_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE b public.decision_work_breaker; batch integer := greatest(1,least(p_limit,50));
BEGIN
  SELECT * INTO b FROM decision_work_breaker FOR UPDATE;
  -- During a mass outage nothing is claimed until the breaker's current step is due.
  IF b.open_until IS NOT NULL AND b.open_until > now() THEN RETURN; END IF;
  IF b.level > 0 THEN
    -- Due step: probe with a small batch; the lease keeps further claims out until the probe reports.
    batch := least(batch, 3);
    UPDATE decision_work_breaker SET half_open=true, open_until=now()+interval '20 minutes', changed_at=now();
  END IF;
  -- A lease that expired after the last allowed attempt never completed: stop retrying it.
  UPDATE decision_work_items SET status='failed', last_error=COALESCE(last_error,'attempts_exhausted')
  WHERE status IN ('pending','running') AND available_at <= now() AND attempts >= greatest(1,p_max_attempts);
  -- Mail arriving now is handled before knowledge fan-out and before history is incorporated.
  RETURN QUERY
  UPDATE decision_work_items SET status='running', attempts=attempts+1, available_at=now()+interval '20 minutes'
  WHERE id IN (SELECT id FROM decision_work_items
    WHERE status IN ('pending','running') AND available_at <= now() AND attempts < greatest(1,p_max_attempts)
    ORDER BY CASE contract WHEN 'incoming_email_decision' THEN 0 WHEN 'knowledge_change' THEN 1 WHEN 'knowledge_impact' THEN 2 ELSE 3 END, available_at, created_at
    FOR UPDATE SKIP LOCKED LIMIT batch)
  RETURNING *;
END;
$$;


ALTER FUNCTION "public"."claim_decision_work"("p_limit" integer, "p_max_attempts" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draft_contact" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "email" "public"."citext",
    "phone" "text",
    "display_name" "text",
    "organization" "text",
    "status" "public"."draft_contact_status" DEFAULT 'proposed'::"public"."draft_contact_status" NOT NULL,
    "merged_into_id" "uuid",
    "confidence" real DEFAULT 0.0 NOT NULL,
    "evidence_count" integer DEFAULT 0 NOT NULL,
    "origin" "public"."draft_contact_origin" DEFAULT 'kairo_created'::"public"."draft_contact_origin" NOT NULL,
    "external_ref" "text",
    "external_source" "text",
    "source_tickets" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "confirmed_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "draft_contact_confidence_range" CHECK ((("confidence" >= (0.0)::double precision) AND ("confidence" <= (1.0)::double precision))),
    CONSTRAINT "draft_contact_confirmation_consistency" CHECK (((("status" = 'confirmed'::"public"."draft_contact_status") AND ("confirmed_at" IS NOT NULL) AND ("confirmed_by" IS NOT NULL)) OR ("status" <> 'confirmed'::"public"."draft_contact_status"))),
    CONSTRAINT "draft_contact_external_consistency" CHECK ((("origin" = 'kairo_created'::"public"."draft_contact_origin") OR (("external_source" IS NOT NULL) AND ("external_ref" IS NOT NULL)))),
    CONSTRAINT "draft_contact_has_identity" CHECK ((("email" IS NOT NULL) OR ("phone" IS NOT NULL)))
);


ALTER TABLE "public"."draft_contact" OWNER TO "postgres";


COMMENT ON TABLE "public"."draft_contact" IS 'Pipeline de identidades de contacto propuestas por el extractor. Confirmar no migra a otra tabla, solo cambia status. KAI-224.';



COMMENT ON COLUMN "public"."draft_contact"."confirmed_by" IS 'auth.users.id del agente que confirmo. Patron del codebase: actor FKs apuntan a auth.users, no a account_members.';



CREATE OR REPLACE FUNCTION "public"."confirm_draft_contact"("p_draft_id" "uuid") RETURNS "public"."draft_contact"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_account_id   uuid;
  v_status       public.draft_contact_status;
  v_origin       public.draft_contact_origin;
  v_updated_row  public.draft_contact;
BEGIN
  SELECT account_id, draft_status, draft_origin
    INTO v_account_id, v_status, v_origin
  FROM public._assert_draft_access(p_draft_id);

  IF v_status <> 'proposed' THEN
    RAISE EXCEPTION 'invalid_state: draft is not proposed (current: %)', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.draft_contact
     SET status       = 'confirmed',
         confirmed_at = now(),
         confirmed_by = auth.uid()
   WHERE id = p_draft_id
   RETURNING * INTO v_updated_row;

  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action)
  VALUES (p_draft_id, v_account_id, auth.uid(), 'confirmed');

  RETURN v_updated_row;
END;
$$;


ALTER FUNCTION "public"."confirm_draft_contact"("p_draft_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_account_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_account_id uuid;
BEGIN
    -- Priority 1: explicit account_id claim in the JWT
    -- Set this claim (in app_metadata) when the user logs in or switches accounts.
    BEGIN
        v_account_id := NULLIF(
            current_setting('request.jwt.claims', true)::jsonb ->> 'account_id',
            ''
        )::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_account_id := NULL;
    END;

    -- If a claim is present, validate the user is still an active member of that account.
    -- This prevents a stale/forged claim from granting access.
    IF v_account_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM "public"."account_members"
            WHERE "account_id" = v_account_id
              AND "user_id" = auth.uid()
              AND "status" = 'active'
        ) THEN
            RETURN v_account_id;
        END IF;
        -- Claim present but user is not an active member → deny everything.
        RETURN NULL;
    END IF;

    -- Fallback for single-account users (no claim set).
    -- Deterministic because most users belong to exactly one account.
    SELECT "account_id" INTO v_account_id
    FROM "public"."account_members"
    WHERE "user_id" = auth.uid()
      AND "status" = 'active'
    ORDER BY "joined_at"
    LIMIT 1;

    RETURN v_account_id;
END;
$$;


ALTER FUNCTION "public"."current_account_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decision_breaker_delay"("p_level" integer) RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT (ARRAY[interval '15 minutes', interval '3 hours', interval '6 hours'])[greatest(1,least(p_level,3))];
$$;


ALTER FUNCTION "public"."decision_breaker_delay"("p_level" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decision_retry_offset"("p_retry" integer) RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT (ARRAY[interval '1 minute', interval '5 minutes', interval '15 minutes', interval '3 hours', interval '6 hours'])[greatest(1,least(p_retry,5))];
$$;


ALTER FUNCTION "public"."decision_retry_offset"("p_retry" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_draft_contact"("p_draft_id" "uuid", "p_patch" "jsonb") RETURNS "public"."draft_contact"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_account_id    uuid;
  v_status        public.draft_contact_status;
  v_origin        public.draft_contact_origin;
  v_before        public.draft_contact;
  v_after         public.draft_contact;
  v_new_email     text;
  v_new_phone     text;
  v_new_name      text;
  v_new_org       text;
  v_changed_keys  text[] := ARRAY[]::text[];
  v_diff          jsonb := '{}'::jsonb;
BEGIN
  SELECT account_id, draft_status, draft_origin
    INTO v_account_id, v_status, v_origin
  FROM public._assert_draft_access(p_draft_id);

  IF v_status <> 'proposed' THEN
    RAISE EXCEPTION 'invalid_state: only proposed drafts can be edited (current: %)', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_origin <> 'kairo_created' THEN
    RAISE EXCEPTION 'invalid_state: external_synced drafts have read-only core fields'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_before FROM public.draft_contact WHERE id = p_draft_id;

  v_new_email := COALESCE(NULLIF(p_patch->>'email', ''), v_before.email);
  v_new_phone := COALESCE(NULLIF(p_patch->>'phone', ''), v_before.phone);
  v_new_name  := COALESCE(NULLIF(p_patch->>'display_name', ''), v_before.display_name);
  v_new_org   := COALESCE(NULLIF(p_patch->>'organization', ''), v_before.organization);

  -- Explicit null support: caller can pass JSON null to clear a field
  IF p_patch ? 'email'        AND (p_patch->>'email')        IS NULL THEN v_new_email := NULL; END IF;
  IF p_patch ? 'phone'        AND (p_patch->>'phone')        IS NULL THEN v_new_phone := NULL; END IF;
  IF p_patch ? 'display_name' AND (p_patch->>'display_name') IS NULL THEN v_new_name  := NULL; END IF;
  IF p_patch ? 'organization' AND (p_patch->>'organization') IS NULL THEN v_new_org   := NULL; END IF;

  IF v_new_email IS NULL AND v_new_phone IS NULL THEN
    RAISE EXCEPTION 'invalid_input: draft must have at least an email or a phone'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Build diff jsonb { field: { before, after } } only for changed keys
  IF v_new_email IS DISTINCT FROM v_before.email THEN
    v_diff := v_diff || jsonb_build_object('email', jsonb_build_object('before', v_before.email, 'after', v_new_email));
    v_changed_keys := array_append(v_changed_keys, 'email');
  END IF;
  IF v_new_phone IS DISTINCT FROM v_before.phone THEN
    v_diff := v_diff || jsonb_build_object('phone', jsonb_build_object('before', v_before.phone, 'after', v_new_phone));
    v_changed_keys := array_append(v_changed_keys, 'phone');
  END IF;
  IF v_new_name IS DISTINCT FROM v_before.display_name THEN
    v_diff := v_diff || jsonb_build_object('display_name', jsonb_build_object('before', v_before.display_name, 'after', v_new_name));
    v_changed_keys := array_append(v_changed_keys, 'display_name');
  END IF;
  IF v_new_org IS DISTINCT FROM v_before.organization THEN
    v_diff := v_diff || jsonb_build_object('organization', jsonb_build_object('before', v_before.organization, 'after', v_new_org));
    v_changed_keys := array_append(v_changed_keys, 'organization');
  END IF;

  IF cardinality(v_changed_keys) = 0 THEN
    RETURN v_before; -- no-op
  END IF;

  -- Apply update (unique constraints on (account_id,email) and (account_id,phone) will
  -- raise 23505 if the new identity collides — caller should catch and prompt merge UI)
  UPDATE public.draft_contact
     SET email        = v_new_email,
         phone        = v_new_phone,
         display_name = v_new_name,
         organization = v_new_org
   WHERE id = p_draft_id
   RETURNING * INTO v_after;

  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action, diff)
  VALUES (p_draft_id, v_account_id, auth.uid(), 'edited', v_diff || jsonb_build_object('changed_fields', to_jsonb(v_changed_keys)));

  RETURN v_after;
END;
$$;


ALTER FUNCTION "public"."edit_draft_contact"("p_draft_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."embedding_dimensions"() RETURNS TABLE("table_name" "text", "dimensions" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 SELECT c.relname::text, a.atttypmod FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='public' AND a.attname='embedding' AND NOT a.attisdropped AND c.relname IN ('tickets','kb_articles','knowledge_embeddings');
$$;


ALTER FUNCTION "public"."embedding_dimensions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_knowledge_candidates"("p_version_id" "uuid", "p_threshold" double precision DEFAULT 0.80, "p_limit" integer DEFAULT 25) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE v public.knowledge_versions; knowledge_indexed boolean; n integer; eligible integer; unembedded integer; cap integer := greatest(1,p_limit);
BEGIN
 SELECT * INTO v FROM knowledge_versions WHERE id=p_version_id;
 IF v.id IS NULL THEN RETURN 0; END IF;
 IF v.source_kind='article' THEN PERFORM 1 FROM kb_articles WHERE id=v.source_id FOR SHARE;
 ELSE PERFORM 1 FROM operational_learning WHERE id=v.source_id FOR SHARE; END IF;
 IF EXISTS(SELECT 1 FROM knowledge_versions WHERE account_id=v.account_id AND source_kind=v.source_kind AND source_id=v.source_id AND revision>v.revision) THEN RETURN 0; END IF;
 IF v.status <> 'approved' THEN
   INSERT INTO ticket_decision_history(account_id,ticket_id,contract,contract_version,case_revision,knowledge_version_id,status,result,idempotency_key)
   SELECT account_id,id,'knowledge_impact','1.0.0',case_revision,v.id,'pending_knowledge',jsonb_build_object('missing',jsonb_build_array('approved_knowledge'),'withdrawnVersion',knowledge_context->v.source_id::text->>'versionId'),'withdrawal:'||id||':'||v.id
   FROM tickets WHERE account_id=v.account_id AND knowledge_context ? v.source_id::text ON CONFLICT DO NOTHING;
   UPDATE tickets SET knowledge_context=knowledge_context-v.source_id::text WHERE account_id=v.account_id AND knowledge_context ? v.source_id::text;
   RETURN 0;
 END IF;
 SELECT semantic_source_similarity(v.account_id,'knowledge_version',v.id,'knowledge_version',v.id) IS NOT NULL INTO knowledge_indexed;
 -- Explicit ties always enter: the source ticket, listed tickets and tickets already using this knowledge.
 -- Everything else must be pending, carry a vector and reach the threshold; the closest ones are queued up to the cap.
 WITH explicit AS (
   SELECT t.id, t.case_revision FROM tickets t WHERE t.account_id=v.account_id AND t.merged_into_ticket_id IS NULL AND (
     v.snapshot->'ticket_ids' @> jsonb_build_array(t.id::text) OR v.snapshot->'tags' @> jsonb_build_array('origin-ticket:'||t.id) OR t.knowledge_context ? v.source_id::text)),
 nearest AS (
   SELECT t.id, t.case_revision FROM tickets t
   WHERE knowledge_indexed AND t.account_id=v.account_id AND t.merged_into_ticket_id IS NULL
     AND COALESCE(t.status,'open') NOT IN ('resolved','ai_resolved','closed') AND semantic_source_similarity(t.account_id,'ticket',t.id,'knowledge_version',v.id) IS NOT NULL
     AND semantic_source_similarity(t.account_id,'ticket',t.id,'knowledge_version',v.id) >= p_threshold AND t.id NOT IN (SELECT id FROM explicit)
   ORDER BY semantic_source_similarity(t.account_id,'ticket',t.id,'knowledge_version',v.id) DESC LIMIT cap)
 INSERT INTO decision_work_items(account_id,ticket_id,knowledge_version_id,contract,dedupe_key)
 SELECT v.account_id, c.id, v.id, 'knowledge_impact', 'impact:'||c.id||':'||c.case_revision||':'||v.id
 FROM (SELECT * FROM explicit UNION ALL SELECT * FROM nearest) c
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 SELECT count(*) INTO eligible FROM tickets t
 WHERE knowledge_indexed AND t.account_id=v.account_id AND t.merged_into_ticket_id IS NULL
   AND COALESCE(t.status,'open') NOT IN ('resolved','ai_resolved','closed') AND semantic_source_similarity(t.account_id,'ticket',t.id,'knowledge_version',v.id) IS NOT NULL
   AND semantic_source_similarity(t.account_id,'ticket',t.id,'knowledge_version',v.id) >= p_threshold;
 SELECT count(*) INTO unembedded FROM tickets t
 WHERE t.account_id=v.account_id AND t.merged_into_ticket_id IS NULL
   AND COALESCE(t.status,'open') NOT IN ('resolved','ai_resolved','closed') AND semantic_source_similarity(t.account_id,'ticket',t.id,'knowledge_version',v.id) IS NULL;
 INSERT INTO knowledge_candidate_runs(account_id,version_id,similarity_threshold,candidate_limit,eligible_tickets,selected_tickets,limit_reached,pending_without_embedding,missing_knowledge_embedding)
 VALUES (v.account_id, v.id, p_threshold, cap, eligible, n, eligible > cap, unembedded, NOT knowledge_indexed);
 RETURN n;
END;
$$;


ALTER FUNCTION "public"."enqueue_knowledge_candidates"("p_version_id" "uuid", "p_threshold" double precision, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_message_decision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE t public.tickets; m public.messages;
BEGIN
  SELECT * INTO t FROM tickets WHERE id = NEW.ticket_id;
  SELECT * INTO m FROM messages WHERE id = NEW.message_id AND account_id = t.account_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Message and ticket account mismatch'; END IF;
  UPDATE tickets SET case_revision = case_revision + 1 WHERE id = t.id;
  IF m.direction = 'inbound' AND COALESCE(m.processing_tier, 0) <> 1 THEN
    INSERT INTO decision_work_items(account_id,ticket_id,message_id,contract,dedupe_key)
    VALUES(t.account_id,t.id,m.id,CASE WHEN COALESCE(m.processing_tier,0) IN (2,3) THEN 'historical_learning' ELSE 'incoming_email_decision' END,'message:'||m.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_message_decision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_pending_knowledge"("p_account_id" "uuid", "p_threshold" double precision DEFAULT 0.80, "p_limit" integer DEFAULT 25) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v record; n integer:=0;
BEGIN
 FOR v IN SELECT id FROM current_knowledge WHERE account_id=p_account_id LOOP n:=n+enqueue_knowledge_candidates(v.id, p_threshold, p_limit); END LOOP;
 RETURN n;
END;
$$;


ALTER FUNCTION "public"."enqueue_pending_knowledge"("p_account_id" "uuid", "p_threshold" double precision, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_account_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Best-effort: a failure here must never block the signup.
    -- The OAuth callback (KAI-218) also calls provision_account_for_user
    -- explicitly, so this is a safety net, not the primary path.
    BEGIN
        PERFORM public.provision_account_for_user(NEW.id, NULL);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING
            '[KAI-217] ensure_account_on_signup: provisioning failed for user % (%): %',
            NEW.id, NEW.email, SQLERRM;
    END;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_account_on_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_account_id" "uuid", "p_limit" integer DEFAULT 3) RETURNS TABLE("article_id" "uuid", "title" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_account_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_account_id" "uuid", "p_limit" integer DEFAULT 5, "p_threshold" double precision DEFAULT 0.75, "p_status_filter" "text" DEFAULT NULL::"text", "p_exclude_same_group" boolean DEFAULT false) RETURNS TABLE("ticket_id" "uuid", "subject" "text", "resolved_at" timestamp with time zone, "resolution_summary" "text", "ticket_number" bigint, "similarity" double precision, "group_id" "uuid")
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


ALTER FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_account_id" "uuid", "p_limit" integer, "p_threshold" double precision, "p_status_filter" "text", "p_exclude_same_group" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "revision" bigint NOT NULL,
    "status" "text" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "actor_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knowledge_versions_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['article'::"text", 'learning'::"text"]))),
    CONSTRAINT "knowledge_versions_status_check" CHECK (("status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."knowledge_versions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_workflow_knowledge"("p_account_id" "uuid", "p_query_embedding" "extensions"."vector", "p_ticket_id" "uuid" DEFAULT NULL::"uuid", "p_threshold" double precision DEFAULT 0.80, "p_limit" integer DEFAULT 12) RETURNS SETOF "public"."knowledge_versions"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
 SELECT v.* FROM current_knowledge v LEFT JOIN knowledge_embeddings e ON e.version_id=v.id
 WHERE v.account_id=p_account_id AND (
  (e.embedding IS NOT NULL AND p_query_embedding IS NOT NULL AND 1-(e.embedding <=> p_query_embedding) >= p_threshold)
  OR (p_ticket_id IS NOT NULL AND v.snapshot->'ticket_ids' @> jsonb_build_array(p_ticket_id::text)))
 ORDER BY (e.embedding <=> p_query_embedding) NULLS LAST, v.revision DESC LIMIT greatest(1,least(p_limit,50));
$$;


ALTER FUNCTION "public"."find_workflow_knowledge"("p_account_id" "uuid", "p_query_embedding" "extensions"."vector", "p_ticket_id" "uuid", "p_threshold" double precision, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classification_accuracy"("p_account_id" "uuid", "p_window" "text" DEFAULT '30d'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."get_classification_accuracy"("p_account_id" "uuid", "p_window" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invitation_by_token"("p_token" "uuid") RETURNS TABLE("id" "uuid", "account_id" "uuid", "account_name" "text", "email" "text", "role" "text", "expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT
        ai.id,
        ai.account_id,
        acc.name AS account_name,
        ai.email,
        ai.role,
        ai.expires_at
    FROM "public"."account_invitations" ai
    JOIN "public"."accounts" acc ON acc.id = ai.account_id
    WHERE ai.token = p_token
      AND ai.expires_at > now();
$$;


ALTER FUNCTION "public"."get_invitation_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sidebar_counts"("p_account_id" "uuid") RETURNS TABLE("status" "text", "count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT status, COUNT(*) AS count
  FROM public.tickets
  WHERE account_id = p_account_id
  GROUP BY status;
$$;


ALTER FUNCTION "public"."get_sidebar_counts"("p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ticket_note_counts"("p_account_id" "uuid", "p_user_id" "uuid") RETURNS TABLE("ticket_id" "uuid", "note_count" bigint, "unread_mentions" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    t.id AS ticket_id,
    COUNT(DISTINCT n.id) AS note_count,
    COUNT(DISTINCT m.id) FILTER (
      WHERE m.mentioned_user_id = p_user_id AND m.read_at IS NULL
    ) AS unread_mentions
  FROM public.tickets t
  JOIN public.ticket_notes n
    ON n.ticket_id = t.id
  LEFT JOIN public.ticket_note_mentions m
    ON m.ticket_note_id = n.id
   AND m.account_id = p_account_id
  WHERE t.account_id = p_account_id
  GROUP BY t.id;
$$;


ALTER FUNCTION "public"."get_ticket_note_counts"("p_account_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."guard_tickets_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  );
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_account_access"("p_account_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "public"."account_members"
        WHERE "account_id" = p_account_id
        AND "user_id" = auth.uid()
        AND "status" = 'active'
    );
END;
$$;


ALTER FUNCTION "public"."has_account_access"("p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_account_admin"("p_account_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "public"."account_members"
        WHERE "account_id" = p_account_id
        AND "user_id" = auth.uid()
        AND "status" = 'active'
        AND "role" IN ('owner', 'admin')
    );
END;
$$;


ALTER FUNCTION "public"."is_account_admin"("p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_uid = auth.uid()
      AND is_active = true
  );
$$;


ALTER FUNCTION "public"."is_active_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_uid = auth.uid()
      AND role = 'superadmin'
  );
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_ticket_viewed"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role IN ('owner','admin','supervisor','agent')) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  UPDATE tickets SET first_viewed_at=COALESCE(first_viewed_at,now()) WHERE id=p_ticket_id AND account_id=p_account_id;
END;
$$;


ALTER FUNCTION "public"."mark_ticket_viewed"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provision_account_for_user"("p_user_id" "uuid", "p_account_name" "text" DEFAULT NULL::"text", "p_plan_code" "text" DEFAULT 'starter'::"text", "p_seat_limit" integer DEFAULT NULL::integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_existing_id  uuid;
    v_account_id   uuid;
    v_plan_id      uuid;
    v_name         text;
    v_slug_base    text;
    v_slug         text;
    v_email        text;
    v_display_name text;
    v_company_name text;
BEGIN
    -- ── Guard: return existing account_id if user already has an active membership ──
    SELECT am.account_id INTO v_existing_id
    FROM public.account_members am
    WHERE am.user_id  = p_user_id
      AND am.status   = 'active'
    ORDER BY am.joined_at NULLS LAST, am.invited_at NULLS LAST
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    -- ── Resolve plan_id from p_plan_code ──────────────────────────────────
    SELECT id INTO v_plan_id
    FROM public.plans
    WHERE code = p_plan_code
    LIMIT 1;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'provision_account_for_user: invalid plan_code: %', p_plan_code;
    END IF;

    -- ── Resolve user identity for name derivation ──────────────────────────
    SELECT u.email,
           COALESCE(p.name, ''),
           COALESCE(p.company_name, '')
      INTO v_email, v_display_name, v_company_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = p_user_id;

    IF v_email IS NULL THEN
        RAISE EXCEPTION
            'provision_account_for_user: user % not found in auth.users', p_user_id;
    END IF;

    -- ── Derive account name (priority: explicit arg > company_name > display_name > email prefix) ──
    v_name := COALESCE(
        NULLIF(trim(p_account_name),  ''),
        NULLIF(trim(v_company_name),  ''),
        NULLIF(trim(v_display_name),  ''),
        split_part(v_email, '@', 1)
    );

    IF v_name IS NULL OR trim(v_name) = '' THEN
        v_name := 'account';
    END IF;

    -- ── Derive URL-safe slug with random suffix ────────────────────────────
    v_slug_base := lower(regexp_replace(trim(v_name), '[^a-z0-9]+', '-', 'g'));
    v_slug_base := trim(both '-' from v_slug_base);
    IF v_slug_base = '' THEN
        v_slug_base := 'account';
    END IF;
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

    -- ── Atomic insert: accounts + account_members ──────────────────────────
    BEGIN
        INSERT INTO public.accounts (name, slug, plan_id, seat_limit)
        VALUES (v_name, v_slug, v_plan_id, p_seat_limit)
        RETURNING id INTO v_account_id;

        INSERT INTO public.account_members
            (account_id, user_id, role, status, joined_at)
        VALUES
            (v_account_id, p_user_id, 'owner', 'active', now());

    EXCEPTION
        WHEN unique_violation THEN
            SELECT am.account_id INTO v_account_id
            FROM public.account_members am
            WHERE am.user_id = p_user_id
              AND am.status  = 'active'
            ORDER BY am.joined_at NULLS LAST
            LIMIT 1;

            IF v_account_id IS NULL THEN
                RAISE EXCEPTION
                    'provision_account_for_user: unique_violation but no membership found for user %',
                    p_user_id;
            END IF;
    END;

    RETURN v_account_id;
END;
$$;


ALTER FUNCTION "public"."provision_account_for_user"("p_user_id" "uuid", "p_account_name" "text", "p_plan_code" "text", "p_seat_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_decision_outcome"("p_ok" boolean, "p_outage_failure" boolean) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE b public.decision_work_breaker; total integer; failures integer; next_level integer;
BEGIN
  INSERT INTO decision_work_outcomes(ok, outage_failure) VALUES (p_ok, p_outage_failure);
  DELETE FROM decision_work_outcomes WHERE recorded_at < now()-interval '1 day';
  SELECT * INTO b FROM decision_work_breaker FOR UPDATE;
  IF b.half_open THEN
    IF p_ok THEN
      UPDATE decision_work_breaker SET level=0, open_until=NULL, half_open=false, changed_at=now();
      RETURN 'closed';
    END IF;
    IF NOT p_outage_failure THEN RETURN 'probing'; END IF;
    IF b.level = 3 THEN
      -- Six hours after their first failure, items that still fail stay failed.
      UPDATE decision_work_items SET status='failed', last_error=COALESCE(last_error,'outage_exceeded_retry_window')
      WHERE status IN ('pending','running') AND first_failed_at IS NOT NULL AND first_failed_at <= now()-interval '6 hours';
    END IF;
    next_level := least(b.level+1, 3);
    UPDATE decision_work_breaker SET level=next_level, open_until=now()+decision_breaker_delay(next_level), half_open=false, changed_at=now();
    RETURN 'open';
  END IF;
  IF b.level > 0 THEN RETURN 'open'; END IF;
  -- Mass outage: at least 10 executions in 5 minutes, 80% of them provider or network failures.
  SELECT count(*), count(*) FILTER (WHERE outage_failure) INTO total, failures FROM decision_work_outcomes
  WHERE recorded_at > greatest(now()-interval '5 minutes', b.changed_at);
  IF total >= 10 AND failures >= 0.8 * total THEN
    UPDATE decision_work_breaker SET level=1, open_until=now()+decision_breaker_delay(1), half_open=false, changed_at=now();
    RETURN 'open';
  END IF;
  RETURN 'closed';
END;
$$;


ALTER FUNCTION "public"."record_decision_outcome"("p_ok" boolean, "p_outage_failure" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_knowledge_version"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE row_data jsonb; version_id uuid; version_status text; kind text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - 'embedding' - 'updated_at') = (row_data - 'embedding' - 'updated_at') THEN
    -- Only the vector changed: attach it to the article's latest version instead of creating one.
    IF TG_TABLE_NAME = 'kb_articles' AND row_data->>'embedding' IS NOT NULL THEN
      SELECT id INTO version_id FROM knowledge_versions WHERE source_kind='article' AND source_id=(row_data->>'id')::uuid ORDER BY revision DESC LIMIT 1;
      IF version_id IS NOT NULL THEN
        INSERT INTO knowledge_embeddings(version_id, account_id, embedding, source)
        VALUES (version_id, (row_data->>'account_id')::uuid, (row_data->>'embedding')::extensions.vector, 'kb_articles.embedding')
        ON CONFLICT ON CONSTRAINT knowledge_embeddings_pkey DO UPDATE SET embedding=EXCLUDED.embedding, source=EXCLUDED.source;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  kind := CASE WHEN TG_TABLE_NAME = 'kb_articles' THEN 'article' ELSE 'learning' END;
  version_status := CASE WHEN TG_OP = 'DELETE' THEN 'withdrawn' WHEN kind = 'article' THEN
    CASE WHEN (row_data->>'is_published')::boolean THEN 'approved'
      WHEN row_data->>'review_status'='approved' THEN 'withdrawn'
      ELSE COALESCE(row_data->>'review_status','pending_review') END
    ELSE row_data->>'status' END;
  INSERT INTO knowledge_versions(account_id, source_kind, source_id, status, snapshot, actor_user_id)
  VALUES ((row_data->>'account_id')::uuid, kind, (row_data->>'id')::uuid, version_status, row_data - 'embedding', (row_data->>'reviewed_by')::uuid)
  RETURNING id INTO version_id;
  IF kind = 'article' AND TG_OP <> 'DELETE' AND row_data->>'embedding' IS NOT NULL THEN
    INSERT INTO knowledge_embeddings(version_id, account_id, embedding, source)
    VALUES (version_id, (row_data->>'account_id')::uuid, (row_data->>'embedding')::extensions.vector, 'kb_articles.embedding');
  END IF;
  IF version_status = 'approved' OR TG_OP <> 'INSERT' THEN
    INSERT INTO decision_work_items(account_id, knowledge_version_id, contract, dedupe_key)
    VALUES ((row_data->>'account_id')::uuid, version_id, 'knowledge_change', 'knowledge:' || version_id::text) ON CONFLICT DO NOTHING;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."record_knowledge_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_ticket_enrichment"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_revision" bigint, "p_version_id" "uuid", "p_result" "jsonb", "p_useful" boolean, "p_key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE t public.tickets; v public.knowledge_versions; outcome text; touched boolean;
BEGIN
  SELECT * INTO v FROM knowledge_versions WHERE id=p_version_id AND account_id=p_account_id;
  IF v.source_kind='article' THEN PERFORM 1 FROM kb_articles WHERE id=v.source_id FOR SHARE;
  ELSE PERFORM 1 FROM operational_learning WHERE id=v.source_id FOR SHARE; END IF;
  SELECT * INTO t FROM tickets WHERE id=p_ticket_id AND account_id=p_account_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  IF EXISTS(SELECT 1 FROM ticket_decision_history WHERE account_id=p_account_id AND idempotency_key=p_key) THEN RETURN 'already_evaluated'; END IF;
  IF t.case_revision <> p_revision THEN RETURN 'stale_case'; END IF;
  IF v.id IS NULL OR v.status <> 'approved' OR EXISTS(SELECT 1 FROM knowledge_versions WHERE account_id=p_account_id AND source_kind=v.source_kind AND source_id=v.source_id AND revision>v.revision) THEN RETURN 'stale_knowledge'; END IF;
  touched := t.first_viewed_at IS NOT NULL OR t.human_modified_at IS NOT NULL OR EXISTS(SELECT 1 FROM ticket_state_history WHERE ticket_id=t.id AND actor_type='human') OR EXISTS(SELECT 1 FROM ticket_activity_log WHERE ticket_id=t.id AND actor_type='human') OR EXISTS(SELECT 1 FROM classification_feedback WHERE ticket_id=t.id) OR EXISTS(SELECT 1 FROM ticket_classification_history WHERE ticket_id=t.id AND actor_type='human') OR EXISTS(SELECT 1 FROM ticket_notes WHERE ticket_id=t.id);
  outcome := CASE WHEN NOT p_useful THEN 'evaluated_without_contribution' WHEN touched THEN 'pending_human_review' ELSE 'enriched' END;
  INSERT INTO ticket_decision_history(account_id,ticket_id,contract,contract_version,case_revision,knowledge_version_id,status,result,idempotency_key)
  VALUES(p_account_id,t.id,'knowledge_impact','1.0.0',p_revision,v.id,outcome,p_result,p_key);
  IF outcome='enriched' THEN UPDATE tickets SET knowledge_context=knowledge_context || jsonb_build_object(v.source_id::text,jsonb_build_object('versionId',v.id,'result',p_result)) WHERE id=t.id; END IF;
  RETURN outcome;
END;
$$;


ALTER FUNCTION "public"."record_ticket_enrichment"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_revision" bigint, "p_version_id" "uuid", "p_result" "jsonb", "p_useful" boolean, "p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_decision_history_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN RAISE EXCEPTION 'Decision and knowledge history is append-only'; END;
$$;


ALTER FUNCTION "public"."reject_decision_history_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_draft_contact"("p_draft_id" "uuid") RETURNS "public"."draft_contact"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_account_id   uuid;
  v_status       public.draft_contact_status;
  v_origin       public.draft_contact_origin;
  v_updated_row  public.draft_contact;
BEGIN
  SELECT account_id, draft_status, draft_origin
    INTO v_account_id, v_status, v_origin
  FROM public._assert_draft_access(p_draft_id);

  IF v_status <> 'proposed' THEN
    RAISE EXCEPTION 'invalid_state: draft is not proposed (current: %)', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.draft_contact
     SET status = 'rejected'
   WHERE id = p_draft_id
   RETURNING * INTO v_updated_row;

  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action)
  VALUES (p_draft_id, v_account_id, auth.uid(), 'rejected');

  RETURN v_updated_row;
END;
$$;


ALTER FUNCTION "public"."reject_draft_contact"("p_draft_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."reject_ticket_activity_log_mutation"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."reject_ticket_classification_history_mutation"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."reject_ticket_state_history_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_decision_work"("p_id" "uuid", "p_error" "text", "p_retriable" boolean, "p_consume_attempt" boolean DEFAULT true, "p_max_attempts" integer DEFAULT 6) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE w public.decision_work_items; first timestamptz;
BEGIN
  SELECT * INTO w FROM decision_work_items WHERE id=p_id FOR UPDATE;
  IF w.id IS NULL OR w.status <> 'running' THEN RETURN COALESCE(w.status,'missing'); END IF;
  IF NOT p_retriable THEN
    UPDATE decision_work_items SET status='failed', last_error=left(p_error,500) WHERE id=p_id;
    RETURN 'failed';
  END IF;
  IF NOT p_consume_attempt THEN
    -- A deployment fault says nothing about the item: it keeps its place on the ladder.
    UPDATE decision_work_items SET status='pending', attempts=greatest(0,w.attempts-1), last_error=left(p_error,500),
      available_at=now()+interval '15 minutes' WHERE id=p_id;
    RETURN 'pending';
  END IF;
  first := COALESCE(w.first_failed_at, now());
  IF w.attempts >= greatest(1,p_max_attempts) THEN
    UPDATE decision_work_items SET status='failed', first_failed_at=first, last_error=left(p_error,500) WHERE id=p_id;
    RETURN 'failed';
  END IF;
  UPDATE decision_work_items SET status='pending', first_failed_at=first, last_error=left(p_error,500),
    available_at=first+decision_retry_offset(w.attempts) WHERE id=p_id;
  RETURN 'pending';
END;
$$;


ALTER FUNCTION "public"."release_decision_work"("p_id" "uuid", "p_error" "text", "p_retriable" boolean, "p_consume_attempt" boolean, "p_max_attempts" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."requeue_failed_decision_work"("p_account_id" "uuid", "p_user_id" "uuid", "p_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_contract" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 500) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE n integer;
BEGIN
  PERFORM 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role='owner' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
  UPDATE decision_work_items SET status='pending', attempts=0, first_failed_at=NULL, available_at=now(), requeued_at=now(), requeued_by=p_user_id
  WHERE id IN (SELECT id FROM decision_work_items
    WHERE account_id=p_account_id AND status='failed'
      AND (p_ids IS NULL OR id = ANY(p_ids)) AND (p_contract IS NULL OR contract=p_contract)
    ORDER BY created_at LIMIT greatest(1,least(p_limit,500)) FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;


ALTER FUNCTION "public"."requeue_failed_decision_work"("p_account_id" "uuid", "p_user_id" "uuid", "p_ids" "uuid"[], "p_contract" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retrieve_semantic_sources"("p_account_id" "uuid", "p_kind" "text", "p_purpose" "text", "p_query" "extensions"."vector", "p_provider" "text", "p_model" "text", "p_dimensions" integer, "p_ticket_id" "uuid" DEFAULT NULL::"uuid", "p_threshold" double precision DEFAULT 0.75, "p_limit" integer DEFAULT 12, "p_status_filter" "text" DEFAULT NULL::"text", "p_exclude_same_group" boolean DEFAULT false, "p_knowledge_kind" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE ticket_group uuid;
BEGIN
 IF p_query IS NULL OR p_dimensions<>768 OR vector_dims(p_query)<>p_dimensions THEN
  RETURN jsonb_build_object('status','unavailable','reason','index_incompatible','matches','[]'::jsonb); END IF;
 IF NOT ((p_kind='ticket' AND p_purpose='similar_cases') OR (p_kind IN ('kb_article','knowledge_version') AND p_purpose='approved_knowledge')) THEN
  RETURN jsonb_build_object('status','unavailable','reason','invalid_input','matches','[]'::jsonb); END IF;
 IF p_ticket_id IS NOT NULL THEN
  SELECT group_id INTO ticket_group FROM tickets WHERE id=p_ticket_id AND account_id=p_account_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable','reason','not_found','matches','[]'::jsonb); END IF;
 END IF;
 RETURN (
 WITH candidates AS NOT MATERIALIZED (
  SELECT t.id,semantic_revision(jsonb_build_array(t.subject,t.body_plain,t.snippet)) AS revision,
   'ticket:subject-body:1000:v1'::text AS preparation,NULL::uuid AS version,
   left(coalesce(t.resolution_summary,t.subject,''),4000) AS content,'historical_case'::text AS authority,
   jsonb_build_object('ticketNumber',t.ticket_number,'subject',left(t.subject,500),'resolvedAt',t.resolved_at,
    'resolutionSummary',left(t.resolution_summary,4000),'groupId',t.group_id) AS metadata,false AS linked,t.embedding IS NOT NULL AS legacy_indexed
  FROM tickets t WHERE p_kind='ticket' AND t.account_id=p_account_id AND t.id IS DISTINCT FROM p_ticket_id
   AND (p_status_filter IS NULL OR t.status=ANY(string_to_array(p_status_filter,',')))
   AND (NOT p_exclude_same_group OR ticket_group IS NULL OR t.group_id IS DISTINCT FROM ticket_group)
  UNION ALL
  SELECT v.id,semantic_revision(jsonb_build_array(v.id,v.revision)),'knowledge:title-body:2000:v1',v.id,
   left(coalesce(v.snapshot->>'content',v.snapshot->>'summary',''),4000),'approved_knowledge',
   jsonb_build_object('knowledge',jsonb_build_object('id',v.id,'account_id',v.account_id,'source_kind',v.source_kind,
    'source_id',v.source_id,'revision',v.revision,'status',v.status,'snapshot',jsonb_build_object(
     'title',left(v.snapshot->>'title',500),'content',left(v.snapshot->>'content',4000),'summary',left(v.snapshot->>'summary',4000),
     'learning_type',v.snapshot->>'learning_type','tags',v.snapshot->'tags'))),
   p_ticket_id IS NOT NULL AND coalesce(v.snapshot->'ticket_ids' @> jsonb_build_array(p_ticket_id::text),false),
   EXISTS(SELECT 1 FROM knowledge_embeddings e WHERE e.account_id=p_account_id AND e.version_id=v.id)
  FROM current_knowledge v WHERE p_kind='knowledge_version' AND v.account_id=p_account_id
   AND (p_knowledge_kind IS NULL OR v.source_kind=p_knowledge_kind)
  UNION ALL
  SELECT a.id,semantic_revision(jsonb_build_array(a.title,a.content,a.is_published,a.review_status)),
   'article:title-content:v1',NULL::uuid,left(a.content,4000),'published_article',
   jsonb_build_object('title',left(a.title,500),'tags',a.tags),false,a.embedding IS NOT NULL
  FROM kb_articles a WHERE p_kind='kb_article' AND a.account_id=p_account_id AND a.is_published
   AND NOT EXISTS(SELECT 1 FROM knowledge_versions v WHERE v.account_id=p_account_id AND v.source_kind='article' AND v.source_id=a.id)
 ), indexed AS NOT MATERIALIZED (
  SELECT c.*,i.embedding,i.source_id IS NOT NULL AS indexed,
   coalesce(i.provider=p_provider AND i.model=p_model AND i.dimensions=p_dimensions AND i.revision=c.revision AND i.preparation=c.preparation,false) AS compatible
  FROM candidates c LEFT JOIN semantic_indexes i ON i.account_id=p_account_id AND i.source_kind=p_kind AND i.source_id=c.id
 ), coverage AS (
  SELECT coalesce(bool_or(NOT indexed AND NOT legacy_indexed AND NOT linked),false) AS missing,
   coalesce(bool_or(((indexed AND NOT compatible) OR (NOT indexed AND legacy_indexed)) AND NOT linked),false) AS incompatible FROM indexed
 ), ranked AS (
  SELECT jsonb_build_object('source',jsonb_build_object('kind',p_kind,'id',id),'revision',revision,'version',version,
   'content',content,'authority',authority,'method',CASE WHEN linked THEN 'explicit_link' ELSE 'semantic' END,
   'similarity',CASE WHEN compatible THEN 1-(embedding<=>p_query) END,'metadata',metadata) AS result,
   CASE WHEN compatible THEN embedding<=>p_query END AS distance,id
  FROM indexed WHERE linked OR (compatible AND 1-(embedding<=>p_query)>=p_threshold)
  ORDER BY distance NULLS LAST,id LIMIT greatest(1,least(p_limit,50))
 ) SELECT jsonb_build_object('status',CASE WHEN missing OR incompatible THEN 'unavailable' ELSE 'ok' END,
   'reason',CASE WHEN incompatible THEN 'index_incompatible' WHEN missing THEN 'index_missing' END,
   'matches',(SELECT coalesce(jsonb_agg(result ORDER BY distance NULLS LAST,id),'[]') FROM ranked)) FROM coverage
 );
END;
$$;


ALTER FUNCTION "public"."retrieve_semantic_sources"("p_account_id" "uuid", "p_kind" "text", "p_purpose" "text", "p_query" "extensions"."vector", "p_provider" "text", "p_model" "text", "p_dimensions" integer, "p_ticket_id" "uuid", "p_threshold" double precision, "p_limit" integer, "p_status_filter" "text", "p_exclude_same_group" boolean, "p_knowledge_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."return_decision_work"("p_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE decision_work_items SET status='pending', attempts=greatest(0,attempts-1), available_at=now() WHERE id=p_id AND status='running';
$$;


ALTER FUNCTION "public"."return_decision_work"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_ticket_enrichment"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid", "p_decision_id" "uuid", "p_accept" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE t public.tickets; d public.ticket_decision_history; v public.knowledge_versions; review_key text;
BEGIN
 PERFORM 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role IN ('owner','admin','supervisor','agent') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
 SELECT * INTO d FROM ticket_decision_history WHERE id=p_decision_id AND account_id=p_account_id AND ticket_id=p_ticket_id AND contract='knowledge_impact' AND status='pending_human_review';
 IF d.id IS NULL THEN RAISE EXCEPTION 'Reviewable proposal not found'; END IF;
 SELECT * INTO v FROM knowledge_versions WHERE id=d.knowledge_version_id AND account_id=p_account_id;
 IF v.source_kind='article' THEN PERFORM 1 FROM kb_articles WHERE id=v.source_id FOR SHARE;
 ELSE PERFORM 1 FROM operational_learning WHERE id=v.source_id FOR SHARE; END IF;
 SELECT * INTO t FROM tickets WHERE id=p_ticket_id AND account_id=p_account_id FOR UPDATE;
 review_key := 'review:'||d.id;
 IF EXISTS(SELECT 1 FROM ticket_decision_history WHERE account_id=p_account_id AND idempotency_key=review_key) THEN RETURN; END IF;
 SELECT * INTO v FROM current_knowledge WHERE id=d.knowledge_version_id AND account_id=p_account_id;
 IF p_accept AND (v.id IS NULL OR t.case_revision <> d.case_revision) THEN RAISE EXCEPTION 'Proposal is stale; request a current solution'; END IF;
 IF p_accept THEN UPDATE tickets SET human_modified_at=now(),knowledge_context=knowledge_context||jsonb_build_object(v.source_id::text,jsonb_build_object('versionId',v.id,'result',d.result)) WHERE id=t.id; END IF;
 INSERT INTO ticket_decision_history(account_id,ticket_id,contract,contract_version,case_revision,knowledge_version_id,status,result,actor_user_id,idempotency_key)
 VALUES(p_account_id,t.id,'knowledge_impact','1.0.0',t.case_revision,d.knowledge_version_id,CASE WHEN p_accept THEN 'approved' ELSE 'rejected' END,jsonb_build_object('reviewOf',d.id,'sources',d.result->'sources','authorization','human_review'),p_user_id,review_key);
END;
$$;


ALTER FUNCTION "public"."review_ticket_enrichment"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid", "p_decision_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_workflow_knowledge"("p_account_id" "uuid", "p_user_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_version_id" "uuid", "p_decision" "text", "p_title" "text" DEFAULT NULL::"text", "p_content" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE current_id uuid;
BEGIN
  PERFORM 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role IN ('owner','admin','supervisor','agent') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF p_decision NOT IN ('approved','rejected','pending_review') THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
  IF p_kind='article' THEN PERFORM 1 FROM kb_articles WHERE id=p_id AND account_id=p_account_id FOR UPDATE;
  ELSIF p_kind='learning' THEN PERFORM 1 FROM operational_learning WHERE id=p_id AND account_id=p_account_id FOR UPDATE;
  ELSE RAISE EXCEPTION 'Invalid knowledge kind'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge not found'; END IF;
  SELECT id INTO current_id FROM knowledge_versions WHERE account_id=p_account_id AND source_kind=p_kind AND source_id=p_id ORDER BY revision DESC LIMIT 1;
  IF current_id IS DISTINCT FROM p_version_id THEN RAISE EXCEPTION 'Knowledge changed; refresh before reviewing'; END IF;
  IF p_kind='article' THEN
    UPDATE kb_articles SET title=COALESCE(p_title,title),content=COALESCE(p_content,content),is_published=(p_decision='approved'),review_status=p_decision,reviewed_by=p_user_id,updated_at=now() WHERE id=p_id;
  ELSE
    UPDATE operational_learning SET summary=COALESCE(p_content,summary),status=p_decision,reviewed_by=p_user_id,reviewed_at=now(),evidence=CASE WHEN p_title IS NULL THEN evidence ELSE evidence||jsonb_build_object('title',p_title) END WHERE id=p_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."review_workflow_knowledge"("p_account_id" "uuid", "p_user_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_version_id" "uuid", "p_decision" "text", "p_title" "text", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_email_knowledge"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_message_id" "uuid", "p_articles" "jsonb", "p_learnings" "jsonb") RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE item jsonb; article_id uuid; ids uuid[] := '{}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tickets t JOIN ticket_messages tm ON tm.ticket_id=t.id JOIN messages m ON m.id=tm.message_id WHERE t.id=p_ticket_id AND t.account_id=p_account_id AND m.id=p_message_id AND m.account_id=p_account_id) THEN RAISE EXCEPTION 'Knowledge source mismatch'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_articles) LOOP
   INSERT INTO kb_articles(account_id,title,content,tags,is_published,source_key) VALUES(p_account_id,item->>'title',item->>'content',ARRAY(SELECT jsonb_array_elements_text(item->'tags')),false,item->>'source_key')
   ON CONFLICT(account_id,source_key) DO NOTHING RETURNING id INTO article_id;
   IF article_id IS NULL THEN SELECT id INTO article_id FROM kb_articles WHERE account_id=p_account_id AND source_key=item->>'source_key'; END IF;
   IF article_id IS NOT NULL THEN ids:=array_append(ids,article_id); END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(p_learnings) LOOP
   INSERT INTO operational_learning(account_id,origin,status,learning_type,summary,ticket_ids,source_count,confidence,source_key,evidence)
   VALUES(p_account_id,'system_derived','pending_review',item->>'learning_type',item->>'summary',ARRAY[p_ticket_id],1,NULL,item->>'source_key',item->'evidence') ON CONFLICT(account_id,source_key) DO NOTHING;
 END LOOP;
 RETURN ids;
END;
$$;


ALTER FUNCTION "public"."save_email_knowledge"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_message_id" "uuid", "p_articles" "jsonb", "p_learnings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_reply_decision"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid", "p_revision" bigint, "p_proposal" "jsonb", "p_result" "jsonb", "p_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE t public.tickets; proposal_id uuid; ref jsonb;
BEGIN
 PERFORM 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role IN ('owner','admin','supervisor','agent') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
 FOR ref IN SELECT * FROM jsonb_array_elements(p_result->'sources') ORDER BY value->>'id' LOOP
   IF ref->>'kind'='article' THEN PERFORM 1 FROM kb_articles WHERE id=(ref->>'id')::uuid AND account_id=p_account_id FOR SHARE;
   ELSE PERFORM 1 FROM operational_learning WHERE id=(ref->>'id')::uuid AND account_id=p_account_id FOR SHARE; END IF;
 END LOOP;
 SELECT * INTO t FROM tickets WHERE id=p_ticket_id AND account_id=p_account_id FOR UPDATE;
 IF t.id IS NULL OR t.case_revision <> p_revision THEN RAISE EXCEPTION 'Case changed; request a new suggestion'; END IF;
 SELECT (result->>'proposalId')::uuid INTO proposal_id FROM ticket_decision_history WHERE account_id=p_account_id AND idempotency_key=p_key;
 IF proposal_id IS NOT NULL THEN RETURN proposal_id; END IF;
 FOR ref IN SELECT * FROM jsonb_array_elements(p_result->'sources') LOOP
   IF NOT EXISTS(SELECT 1 FROM current_knowledge WHERE account_id=p_account_id AND id=(ref->>'version')::uuid) THEN RAISE EXCEPTION 'Knowledge changed; request a new suggestion'; END IF;
 END LOOP;
 INSERT INTO ticket_proposals(ticket_id,conversation_id,message_ids,proposed_reply,referenced_kb_articles,confidence_score,model_version,raw_llm_output,status)
 VALUES(t.id,t.conversation_id,'{}',p_proposal->>'proposed_reply',ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_proposal->'referenced_kb_articles')), (p_proposal->>'confidence_score')::float,p_proposal->>'model_version',p_proposal->'raw_llm_output','pending') RETURNING id INTO proposal_id;
 INSERT INTO ticket_decision_history(account_id,ticket_id,contract,contract_version,case_revision,status,result,actor_user_id,idempotency_key)
 VALUES(p_account_id,t.id,'reply_suggestion','1.0.0',p_revision,'proposed',p_result||jsonb_build_object('proposalId',proposal_id),p_user_id,p_key);
 RETURN proposal_id;
END;
$$;


ALTER FUNCTION "public"."save_reply_decision"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid", "p_revision" bigint, "p_proposal" "jsonb", "p_result" "jsonb", "p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semantic_index_vector"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_query_kind" "text" DEFAULT NULL::"text", "p_query_id" "uuid" DEFAULT NULL::"uuid") RETURNS "extensions"."vector"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE source jsonb; query_source jsonb;
BEGIN
 source:=semantic_source(p_account_id,p_kind,p_id);
 IF source IS NULL OR source#>>'{index,revision}' IS DISTINCT FROM source->>'revision'
  OR source#>>'{index,preparation}' IS DISTINCT FROM source->>'preparation'
  OR coalesce(source#>>'{index,space,provider}','')='' OR coalesce(source#>>'{index,space,model}','')=''
  OR coalesce((source#>>'{index,space,dimensions}')::integer,0)<>768 THEN RETURN NULL; END IF;
 IF p_query_kind IS NOT NULL OR p_query_id IS NOT NULL THEN
  IF p_query_kind IS NULL OR p_query_id IS NULL THEN RETURN NULL; END IF;
  query_source:=semantic_source(p_account_id,p_query_kind,p_query_id);
  IF query_source IS NULL OR query_source#>>'{index,revision}' IS DISTINCT FROM query_source->>'revision'
   OR query_source#>>'{index,preparation}' IS DISTINCT FROM query_source->>'preparation'
   OR source#>'{index,space}' IS DISTINCT FROM query_source#>'{index,space}' THEN RETURN NULL; END IF;
 END IF;
 RETURN (source#>'{index,vector}')::text::extensions.vector;
END;
$$;


ALTER FUNCTION "public"."semantic_index_vector"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_query_kind" "text", "p_query_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semantic_revision"("p_source" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
 SELECT encode(sha256(convert_to(p_source::text,'UTF8')),'hex');
$$;


ALTER FUNCTION "public"."semantic_revision"("p_source" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semantic_source"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE r jsonb; txt text; rev text; prep text; idx jsonb;
BEGIN
 IF p_kind='ticket' THEN
  SELECT to_jsonb(t) INTO r FROM tickets t WHERE id=p_id AND account_id=p_account_id;
  txt:=left(concat_ws(E'\n\n',nullif(btrim(r->>'subject'),''),nullif(btrim(coalesce(nullif(r->>'body_plain',''),r->>'snippet')),'')),1000);
  prep:='ticket:subject-body:1000:v1';
 ELSIF p_kind='kb_article' THEN
  SELECT to_jsonb(a) INTO r FROM kb_articles a WHERE id=p_id AND account_id=p_account_id;
  txt:=concat_ws(E'\n\n',nullif(btrim(r->>'title'),''),nullif(btrim(r->>'content'),''));
  prep:='article:title-content:v1';
 ELSIF p_kind='knowledge_version' THEN
  SELECT to_jsonb(v) INTO r FROM current_knowledge v WHERE id=p_id AND account_id=p_account_id;
  txt:=left(btrim(coalesce(r->'snapshot'->>'title',r->'snapshot'->'evidence'->>'title','')||E'\n'||coalesce(r->'snapshot'->>'content',r->'snapshot'->>'summary','')),2000);
  prep:='knowledge:title-body:2000:v1';
 ELSE RETURN NULL;
 END IF;
 IF r IS NULL THEN RETURN NULL; END IF;
 -- Revision includes authorization and source changes, but excludes vector writes.
 rev:=semantic_revision(CASE WHEN p_kind='ticket' THEN jsonb_build_array(r->'subject',r->'body_plain',r->'snippet')
  WHEN p_kind='kb_article' THEN jsonb_build_array(r->'title',r->'content',r->'is_published',r->'review_status')
  ELSE jsonb_build_array(r->'id',r->'revision') END);
 SELECT jsonb_build_object('revision',i.revision,'preparation',i.preparation,
  'space',jsonb_build_object('provider',i.provider,'model',i.model,'dimensions',i.dimensions),'vector',i.embedding::text::jsonb) INTO idx
 FROM semantic_indexes i WHERE account_id=p_account_id AND source_kind=p_kind AND source_id=p_id;
 RETURN jsonb_build_object('reference',jsonb_build_object('kind',p_kind,'id',p_id),'accountId',p_account_id,
  'revision',rev,'text',coalesce(txt,''),'preparation',prep,'index',idx,'input',CASE WHEN p_kind='knowledge_version' THEN r->'snapshot' WHEN p_kind='ticket' THEN jsonb_build_object('subject',r->'subject','body_plain',r->'body_plain','snippet',r->'snippet') ELSE jsonb_build_object('title',r->'title','content',r->'content') END);
END;
$$;


ALTER FUNCTION "public"."semantic_source"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semantic_source_similarity"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_query_kind" "text", "p_query_id" "uuid") RETURNS double precision
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
 SELECT 1-(semantic_index_vector(p_account_id,p_kind,p_id,p_query_kind,p_query_id)
  <=> semantic_index_vector(p_account_id,p_query_kind,p_query_id));
$$;


ALTER FUNCTION "public"."semantic_source_similarity"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_query_kind" "text", "p_query_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semantic_sources"("p_account_id" "uuid", "p_kind" "text", "p_ids" "uuid"[]) RETURNS TABLE("source" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 SELECT loaded.source FROM (
  SELECT semantic_source(p_account_id,p_kind,id) AS source FROM unnest(p_ids) id WHERE cardinality(p_ids)<=200
 ) loaded WHERE loaded.source IS NOT NULL;
$$;


ALTER FUNCTION "public"."semantic_sources"("p_account_id" "uuid", "p_kind" "text", "p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_default_plan_id_on_accounts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.plan_id IS NULL THEN
        SELECT id INTO NEW.plan_id
        FROM public.plans
        WHERE code = 'starter'
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_default_plan_id_on_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_semantic_index"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_revision" "text", "p_preparation" "text", "p_provider" "text", "p_model" "text", "p_dimensions" integer, "p_embedding" "extensions"."vector") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE current_source jsonb;
BEGIN
 IF p_dimensions<>768 OR vector_dims(p_embedding)<>p_dimensions THEN RAISE EXCEPTION 'Incompatible vector dimensions'; END IF;
 IF p_kind='ticket' THEN PERFORM 1 FROM tickets WHERE id=p_id AND account_id=p_account_id FOR UPDATE;
 ELSIF p_kind='kb_article' THEN PERFORM 1 FROM kb_articles WHERE id=p_id AND account_id=p_account_id FOR UPDATE;
 ELSIF p_kind='knowledge_version' THEN
  -- Serialize with publication/withdrawal, which locks the mutable source row first.
  PERFORM 1 FROM kb_articles a JOIN knowledge_versions v ON v.source_kind='article' AND v.source_id=a.id
   WHERE v.id=p_id AND v.account_id=p_account_id AND a.account_id=p_account_id FOR UPDATE OF a;
  PERFORM 1 FROM operational_learning l JOIN knowledge_versions v ON v.source_kind='learning' AND v.source_id=l.id
   WHERE v.id=p_id AND v.account_id=p_account_id AND l.account_id=p_account_id FOR UPDATE OF l;
 ELSE RETURN 'revision_changed'; END IF;
 current_source:=semantic_source(p_account_id,p_kind,p_id);
 IF current_source IS NULL OR current_source->>'revision' IS DISTINCT FROM p_revision OR current_source->>'preparation' IS DISTINCT FROM p_preparation THEN RETURN 'revision_changed'; END IF;
 INSERT INTO semantic_indexes(account_id,source_kind,source_id,revision,preparation,provider,model,dimensions,embedding)
 VALUES(p_account_id,p_kind,p_id,p_revision,p_preparation,p_provider,p_model,p_dimensions,p_embedding)
 ON CONFLICT(account_id,source_kind,source_id) DO UPDATE SET revision=EXCLUDED.revision,preparation=EXCLUDED.preparation,
  provider=EXCLUDED.provider,model=EXCLUDED.model,dimensions=EXCLUDED.dimensions,embedding=EXCLUDED.embedding,created_at=now();
 RETURN 'indexed';
END;
$$;


ALTER FUNCTION "public"."store_semantic_index"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_revision" "text", "p_preparation" "text", "p_provider" "text", "p_model" "text", "p_dimensions" integer, "p_embedding" "extensions"."vector") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unreject_draft_contact"("p_draft_id" "uuid") RETURNS "public"."draft_contact"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_account_id   uuid;
  v_status       public.draft_contact_status;
  v_origin       public.draft_contact_origin;
  v_updated_row  public.draft_contact;
BEGIN
  SELECT account_id, draft_status, draft_origin
    INTO v_account_id, v_status, v_origin
  FROM public._assert_draft_access(p_draft_id);

  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'invalid_state: draft is not rejected (current: %)', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.draft_contact
     SET status = 'proposed'
   WHERE id = p_draft_id
   RETURNING * INTO v_updated_row;

  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action)
  VALUES (p_draft_id, v_account_id, auth.uid(), 'unrejected');

  RETURN v_updated_row;
END;
$$;


ALTER FUNCTION "public"."unreject_draft_contact"("p_draft_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_plans_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_plans_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"(),
    "expires_at" timestamp with time zone NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'supervisor'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."account_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "invited_at" timestamp with time zone,
    "joined_at" timestamp with time zone,
    CONSTRAINT "account_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'supervisor'::"text", 'agent'::"text"]))),
    CONSTRAINT "account_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."account_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "seat_limit" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "signature_plain" "text",
    "signature_html" "text",
    "brand_color" "text" DEFAULT '#5c6bc0'::"text",
    "help_center_url" "text",
    "status_url" "text",
    "privacy_url" "text",
    "unsubscribe_url" "text",
    "business_context" "text",
    "business_context_updated_at" timestamp with time zone,
    "business_context_source" "text",
    "language" "text" DEFAULT 'es'::"text" NOT NULL,
    CONSTRAINT "chk_accounts_language" CHECK (("language" = ANY (ARRAY['es'::"text", 'en'::"text"]))),
    CONSTRAINT "chk_business_context_source" CHECK ((("business_context_source" IS NULL) OR ("business_context_source" = ANY (ARRAY['derived'::"text", 'manual'::"text"]))))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."accounts"."signature_plain" IS 'Agent email signature (plain text) appended to all outbound messages (KAI-115)';



COMMENT ON COLUMN "public"."accounts"."signature_html" IS 'Agent email signature (HTML) used inside the HTML email wrapper (KAI-115)';



COMMENT ON COLUMN "public"."accounts"."brand_color" IS 'Primary brand color (hex e.g. #5c6bc0) for HTML email wrapper header (KAI-115)';



COMMENT ON COLUMN "public"."accounts"."business_context" IS 'What this company does, in prose, for the {{business_context}} block of the email-classification rubric. NULL means the rubric renders "(no disponible)". Read only by the backfill stage (tier 2/3, incremental-sync, gmail-poll, reclassify endpoints) -- never by tier 1 (KAI-93).';



COMMENT ON COLUMN "public"."accounts"."business_context_updated_at" IS 'When business_context last changed. The value is expected to be refined over time; this dates the text that a given classification saw.';



COMMENT ON COLUMN "public"."accounts"."business_context_source" IS 'derived = inferred by Kairo from the account''s own mail; manual = written by a person. Only "derived" corresponds to what the KAI-93 bench measured.';



COMMENT ON COLUMN "public"."accounts"."language" IS 'Rubric language for this tenant. Must match a file in packages/intelligence/prompts/email-classification/ and a member of SUPPORTED_LANGS.';



CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_table" "text" NOT NULL,
    "target_id" "uuid",
    "changes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_uid" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_login_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])))
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorization_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "ticket_id" "uuid",
    "predicted_category" "text",
    "predicted_priority" "text",
    "predicted_sentiment" "text",
    "confidence_score" double precision NOT NULL,
    "model_version" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "final_category" "text",
    "final_priority" "text",
    "final_sentiment" "text",
    "is_correction" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categorization_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "external_account_id" "text" NOT NULL,
    "display_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "gmail_history_id" "text"
);


ALTER TABLE "public"."channel_integrations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."channel_integrations"."gmail_history_id" IS 'Gmail History API cursor (historyId) for incremental polling (KAI-248). NULL until seeded via users.getProfile on first poll for the account.';



CREATE TABLE IF NOT EXISTS "public"."classification_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "submitted_by_user_id" "uuid",
    "corrected_by" "uuid" NOT NULL,
    "ai_ticket_type" "text",
    "ai_priority" "text",
    "ai_category" "text",
    "ai_sentiment" "text",
    "ai_model_version" "text",
    "ai_confidence" numeric(3,2),
    "correct_ticket_type" "text",
    "correct_priority" "text",
    "correct_category" "text",
    "correct_sentiment" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ai_mail_facts" "jsonb",
    "ai_model_verdict" "jsonb",
    "ai_routing_policy_version" "text",
    "ai_derivation_version" "text",
    "ai_prompt_version" "text",
    CONSTRAINT "chk_cf_category" CHECK ((("correct_category" IS NULL) OR ("correct_category" = ANY (ARRAY['technical'::"text", 'billing'::"text", 'account'::"text", 'general'::"text", 'not_applicable'::"text"])))),
    CONSTRAINT "chk_cf_priority" CHECK ((("correct_priority" IS NULL) OR ("correct_priority" = ANY (ARRAY['P1'::"text", 'P2'::"text", 'P3'::"text"])))),
    CONSTRAINT "chk_cf_sentiment" CHECK ((("correct_sentiment" IS NULL) OR ("correct_sentiment" = ANY (ARRAY['aggressive'::"text", 'frustrated'::"text", 'neutral'::"text", 'positive'::"text"])))),
    CONSTRAINT "chk_cf_ticket_type" CHECK ((("correct_ticket_type" IS NULL) OR ("correct_ticket_type" = ANY (ARRAY['support'::"text", 'prospect'::"text", 'spam'::"text", 'internal'::"text", 'other'::"text"]))))
);


ALTER TABLE "public"."classification_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "internal_id" "text" NOT NULL,
    "legal_id" "text",
    "name" "text" NOT NULL,
    "telephone" "text",
    "authorized_emails" "text"[] DEFAULT ARRAY[]::"text"[],
    "contact_persons" "jsonb" DEFAULT '[]'::"jsonb",
    "plan_type" "text",
    "sla_level" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "account_id" "uuid" NOT NULL,
    CONSTRAINT "clients_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['Enterprise'::"text", 'Pro'::"text", 'Starter'::"text"]))),
    CONSTRAINT "clients_sla_level_check" CHECK (("sla_level" = ANY (ARRAY['Critical'::"text", 'High'::"text", 'Standard'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_integration_id" "uuid" NOT NULL,
    "customer_external_id" "text" NOT NULL,
    "customer_display_name" "text",
    "customer_avatar_url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_thread_id" "text",
    "account_id" "uuid" NOT NULL
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."csat_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "score" integer,
    "comment" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "csat_events_score_check" CHECK ((("score" >= 1) AND ("score" <= 5)))
);


ALTER TABLE "public"."csat_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."latest_knowledge" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("account_id", "source_kind", "source_id") "id",
    "account_id",
    "source_kind",
    "source_id",
    "revision",
    "status",
    "snapshot",
    "actor_user_id",
    "created_at"
   FROM "public"."knowledge_versions"
  ORDER BY "account_id", "source_kind", "source_id", "revision" DESC;


ALTER VIEW "public"."latest_knowledge" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."current_knowledge" WITH ("security_invoker"='true') AS
 SELECT "id",
    "account_id",
    "source_kind",
    "source_id",
    "revision",
    "status",
    "snapshot",
    "actor_user_id",
    "created_at"
   FROM "public"."latest_knowledge"
  WHERE ("status" = 'approved'::"text");


ALTER VIEW "public"."current_knowledge" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."decision_work_breaker" (
    "id" boolean DEFAULT true NOT NULL,
    "level" integer DEFAULT 0 NOT NULL,
    "open_until" timestamp with time zone,
    "half_open" boolean DEFAULT false NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "decision_work_breaker_id_check" CHECK ("id"),
    CONSTRAINT "decision_work_breaker_level_check" CHECK ((("level" >= 0) AND ("level" <= 3)))
);


ALTER TABLE "public"."decision_work_breaker" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."decision_work_outcomes" (
    "id" bigint NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ok" boolean NOT NULL,
    "outage_failure" boolean NOT NULL
);


ALTER TABLE "public"."decision_work_outcomes" OWNER TO "postgres";


ALTER TABLE "public"."decision_work_outcomes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."decision_work_outcomes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."draft_contact_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "draft_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "diff" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "draft_contact_audit_action_check" CHECK (("action" = ANY (ARRAY['confirmed'::"text", 'rejected'::"text", 'edited'::"text", 'unrejected'::"text"])))
);


ALTER TABLE "public"."draft_contact_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."draft_contact_audit_log" IS 'Linear audit trail of agent actions on draft_contact rows. KAI-228.';



CREATE TABLE IF NOT EXISTS "public"."escalation_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "channel" "text" DEFAULT 'sms'::"text" NOT NULL,
    "escalation_level" integer DEFAULT 2 NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "account_id" "uuid" NOT NULL,
    CONSTRAINT "escalation_contacts_channel_check" CHECK (("channel" = ANY (ARRAY['sms'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."escalation_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "escalated_to_level" integer NOT NULL,
    "escalated_by" "uuid" NOT NULL,
    "reason" "text",
    "context" "jsonb",
    "notification_sent" boolean DEFAULT false,
    "notification_channel" "text",
    "notification_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."escalations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kb_articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "extensions"."vector"(768),
    "tags" "text"[],
    "is_published" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "account_id" "uuid" NOT NULL,
    "review_status" "text",
    "reviewed_by" "uuid",
    "source_key" "text"
);


ALTER TABLE "public"."kb_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_candidate_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "version_id" "uuid" NOT NULL,
    "similarity_threshold" double precision NOT NULL,
    "candidate_limit" integer NOT NULL,
    "eligible_tickets" integer NOT NULL,
    "selected_tickets" integer NOT NULL,
    "limit_reached" boolean NOT NULL,
    "pending_without_embedding" integer NOT NULL,
    "missing_knowledge_embedding" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knowledge_candidate_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_embeddings" (
    "version_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "embedding" "extensions"."vector"(768) NOT NULL,
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knowledge_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_decision_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "message_id" "uuid",
    "contract" "text" NOT NULL,
    "contract_version" "text" NOT NULL,
    "case_revision" bigint NOT NULL,
    "knowledge_version_id" "uuid",
    "status" "text" NOT NULL,
    "result" "jsonb" NOT NULL,
    "actor_user_id" "uuid",
    "idempotency_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_decision_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_state_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "seq" bigint NOT NULL,
    "from_state" "text",
    "to_state" "text" NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_ref" "text",
    "trigger" "text" NOT NULL,
    "reason" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb",
    "idempotency_key" "text",
    CONSTRAINT "ticket_state_history_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['human'::"text", 'ai'::"text", 'customer'::"text", 'system'::"text"]))),
    CONSTRAINT "ticket_state_history_from_state_check" CHECK ((("from_state" IS NULL) OR ("from_state" = ANY (ARRAY['open'::"text", 'awaiting_customer'::"text", 'in_progress'::"text", 'resolved'::"text", 'ai_resolved'::"text", 'escalated'::"text", 'reopened'::"text", 'closed'::"text"])))),
    CONSTRAINT "ticket_state_history_to_state_check" CHECK (("to_state" = ANY (ARRAY['open'::"text", 'awaiting_customer'::"text", 'in_progress'::"text", 'resolved'::"text", 'ai_resolved'::"text", 'escalated'::"text", 'reopened'::"text", 'closed'::"text"]))),
    CONSTRAINT "ticket_state_history_trigger_check" CHECK (("trigger" = ANY (ARRAY['ticket_created'::"text", 'manual_status_change'::"text", 'agent_reply'::"text", 'agent_reply_resolve'::"text", 'customer_reply'::"text", 'escalate_action'::"text", 'sla_escalation'::"text", 'external_domain_closure'::"text"])))
);


ALTER TABLE "public"."ticket_state_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_state_history" IS 'Append-only trail of ticket state transitions. account_id is denormalised on purpose so tenant scoping and metrics need no join back to tickets.';



CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "originating_user_id" "uuid",
    "gmail_message_id" "text",
    "gmail_thread_id" "text",
    "subject" "text" NOT NULL,
    "from_email" "text",
    "from_name" "text",
    "to_email" "text",
    "cc_emails" "text"[],
    "received_at" timestamp with time zone,
    "body_plain" "text",
    "body_html" "text",
    "snippet" "text",
    "ticket_type" "text",
    "priority" "text",
    "category" "text",
    "sentiment" "text",
    "status" "text" DEFAULT 'open'::"text",
    "assigned_to" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ticket_number" bigint NOT NULL,
    "conversation_id" "uuid",
    "parent_ticket_id" "uuid",
    "merged_into_ticket_id" "uuid",
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "first_response_at" timestamp with time zone,
    "sla_due_at" timestamp with time zone,
    "sla_breached" boolean DEFAULT false NOT NULL,
    "client_id" "uuid",
    "ai_reasoning" "text",
    "classified_at" timestamp with time zone,
    "classification_confidence" numeric(3,2),
    "classification_tier" integer,
    "priority_score" numeric(4,3),
    "emotion" "text",
    "emotion_confidence" numeric(3,2),
    "score_computed_at" timestamp with time zone,
    "group_id" "uuid",
    "resolution_summary" "text",
    "last_response_at" timestamp with time zone,
    "embedding" "extensions"."vector"(768),
    "embedding_updated_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "auto_replied_out_of_hours" boolean DEFAULT false NOT NULL,
    "auto_replied_at" timestamp with time zone,
    "account_id" "uuid" NOT NULL,
    "short_id" "text" GENERATED ALWAYS AS ("substring"(("id")::"text", 1, 8)) STORED,
    "model_verdict" "jsonb",
    "derivation_version" "text",
    "prompt_version" "text",
    "abstain" boolean DEFAULT false NOT NULL,
    "first_viewed_at" timestamp with time zone,
    "human_modified_at" timestamp with time zone,
    "case_revision" bigint DEFAULT 0 NOT NULL,
    "knowledge_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "chk_category" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['technical'::"text", 'billing'::"text", 'account'::"text", 'general'::"text", 'not_applicable'::"text"])))),
    CONSTRAINT "chk_emotion" CHECK ((("emotion" IS NULL) OR ("emotion" = ANY (ARRAY['aggressive'::"text", 'frustrated'::"text", 'neutral'::"text", 'positive'::"text"])))),
    CONSTRAINT "chk_priority" CHECK ((("priority" IS NULL) OR ("priority" = ANY (ARRAY['P1'::"text", 'P2'::"text", 'P3'::"text"])))),
    CONSTRAINT "chk_priority_score" CHECK ((("priority_score" IS NULL) OR (("priority_score" >= 0.000) AND ("priority_score" <= 1.000)))),
    CONSTRAINT "chk_sentiment" CHECK ((("sentiment" IS NULL) OR ("sentiment" = ANY (ARRAY['aggressive'::"text", 'frustrated'::"text", 'neutral'::"text", 'positive'::"text"])))),
    CONSTRAINT "chk_ticket_type" CHECK ((("ticket_type" IS NULL) OR ("ticket_type" = ANY (ARRAY['support'::"text", 'prospect'::"text", 'spam'::"text", 'internal'::"text", 'other'::"text"])))),
    CONSTRAINT "tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'awaiting_customer'::"text", 'in_progress'::"text", 'resolved'::"text", 'ai_resolved'::"text", 'escalated'::"text", 'reopened'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tickets"."short_id" IS 'First 8 hex chars of ticket UUID used as stable token [KAIRO-<shortid>] in outbound email subject/footer for broken-thread re-association (KAI-115)';



COMMENT ON COLUMN "public"."tickets"."model_verdict" IS 'What the model answered for the current classification — the two axes and the other fields, before the derivation table — plus the ensemble''s second answer when one ran.';



COMMENT ON COLUMN "public"."tickets"."derivation_version" IS 'DERIVATION_VERSION of the table that turned provenance and the axes into ticket_type.';



COMMENT ON COLUMN "public"."tickets"."prompt_version" IS 'Rubric version the current classification was made with.';



COMMENT ON COLUMN "public"."tickets"."abstain" IS 'The classification ensemble disagreed on the type. Such a ticket is never auto-approved.';



CREATE OR REPLACE VIEW "public"."knowledge_enrichment_coverage" WITH ("security_invoker"='true') AS
 SELECT "account_id",
    "count"(*) AS "total_tickets",
    "count"(*) FILTER (WHERE ("classification_tier" = 1)) AS "initial_tickets",
    "count"(*) FILTER (WHERE (EXISTS ( SELECT 1
           FROM ("public"."decision_work_items" "w"
             JOIN "public"."current_knowledge" "v" ON (("v"."id" = "w"."knowledge_version_id")))
          WHERE (("w"."ticket_id" = "t"."id") AND ("w"."contract" = 'knowledge_impact'::"text"))))) AS "candidate_tickets",
    "count"(*) FILTER (WHERE (EXISTS ( SELECT 1
           FROM ("public"."ticket_decision_history" "h"
             JOIN "public"."current_knowledge" "v" ON (("v"."id" = "h"."knowledge_version_id")))
          WHERE (("h"."ticket_id" = "t"."id") AND ("h"."case_revision" = "t"."case_revision") AND ("h"."contract" = 'knowledge_impact'::"text"))))) AS "evaluated_current_tickets",
    "count"(*) FILTER (WHERE (EXISTS ( SELECT 1
           FROM ("jsonb_each"("t"."knowledge_context") "ref"("key", "value")
             JOIN "public"."current_knowledge" "v" ON ((("v"."id")::"text" = ("ref"."value" ->> 'versionId'::"text"))))))) AS "using_current_knowledge",
    "count"(*) FILTER (WHERE (("classification_tier" = 1) AND (EXISTS ( SELECT 1
           FROM "public"."ticket_decision_history" "h"
          WHERE (("h"."ticket_id" = "t"."id") AND ("h"."contract" = 'knowledge_impact'::"text")))))) AS "evaluated_initial_tickets",
    "count"(*) FILTER (WHERE ((EXISTS ( SELECT 1
           FROM "public"."ticket_decision_history" "h"
          WHERE (("h"."ticket_id" = "t"."id") AND ("h"."status" = ANY (ARRAY['approved'::"text", 'enriched'::"text"]))))) AND (EXISTS ( SELECT 1
           FROM "public"."ticket_state_history" "h"
          WHERE (("h"."ticket_id" = "t"."id") AND ("h"."to_state" = 'resolved'::"text") AND ("h"."actor_type" = 'human'::"text")))))) AS "resolved_with_contributions",
    "count"(*) FILTER (WHERE (("embedding" IS NULL) AND ("merged_into_ticket_id" IS NULL) AND (COALESCE("status", 'open'::"text") <> ALL (ARRAY['resolved'::"text", 'ai_resolved'::"text", 'closed'::"text"])))) AS "pending_without_embedding",
    ( SELECT "count"(*) AS "count"
           FROM "public"."knowledge_candidate_runs" "r"
          WHERE (("r"."account_id" = "t"."account_id") AND "r"."limit_reached")) AS "selections_limit_reached"
   FROM "public"."tickets" "t"
  GROUP BY "account_id";


ALTER VIEW "public"."knowledge_enrichment_coverage" OWNER TO "postgres";


ALTER TABLE "public"."knowledge_versions" ALTER COLUMN "revision" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."knowledge_versions_revision_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."llm_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "triggered_by_user_id" "uuid",
    "ticket_id" "uuid",
    "feature" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_version" "text",
    "prompt_text" "text" NOT NULL,
    "response_text" "text",
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "confidence_score" numeric(4,3),
    "latency_ms" integer,
    "outcome" "text",
    "outcome_recorded_at" timestamp with time zone,
    "error_code" "text",
    "error_detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid",
    CONSTRAINT "llm_calls_confidence_check" CHECK ((("confidence_score" IS NULL) OR (("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (1)::numeric)))),
    CONSTRAINT "llm_calls_outcome_check" CHECK ((("outcome" IS NULL) OR ("outcome" = ANY (ARRAY['accepted'::"text", 'edited'::"text", 'rejected'::"text", 'ignored'::"text", 'auto_applied'::"text"]))))
);


ALTER TABLE "public"."llm_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "channel_integration_id" "uuid" NOT NULL,
    "external_id" "text",
    "thread_external_id" "text",
    "direction" "text" NOT NULL,
    "sender_external_id" "text",
    "sender_display_name" "text",
    "body_plain" "text",
    "body_html" "text",
    "snippet" "text",
    "raw_payload" "jsonb",
    "received_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "classification_status" "text",
    "skip_reason" "text",
    "processing_tier" integer,
    "classified_at" timestamp with time zone,
    "processing_batch" "text",
    "account_id" "uuid" NOT NULL,
    "delivery_status" "text",
    "send_error" "jsonb",
    "send_attempts" integer DEFAULT 0 NOT NULL,
    "message_id_header" "text",
    "subject" "text",
    "classification_attempt_count" integer DEFAULT 0 NOT NULL,
    "last_classification_attempt_at" timestamp with time zone,
    "mail_facts" "jsonb",
    "routing_policy_version" "text",
    CONSTRAINT "messages_classification_status_check" CHECK ((("classification_status" IS NULL) OR ("classification_status" = ANY (ARRAY['pending'::"text", 'classified'::"text", 'skipped'::"text", 'failed'::"text", 'failed_permanent'::"text"])))),
    CONSTRAINT "messages_delivery_status_check" CHECK ((("delivery_status" IS NULL) OR ("delivery_status" = ANY (ARRAY['queued'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text"]))))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."messages"."processing_batch" IS 'onboarding = initial 90-day backfill, incremental = recurring sync';



COMMENT ON COLUMN "public"."messages"."delivery_status" IS 'Outbox delivery state for outbound messages: queued -> sending -> sent | failed. NULL for inbound messages. KAI-114.';



COMMENT ON COLUMN "public"."messages"."send_error" IS 'Last send error detail ({ code, message }) when delivery_status = failed. KAI-114.';



COMMENT ON COLUMN "public"."messages"."send_attempts" IS 'Number of send attempts made by the outbound worker. KAI-114.';



COMMENT ON COLUMN "public"."messages"."message_id_header" IS 'RFC 2822 Message-ID header value (e.g. <abc@mail.gmail.com>) stored for inbound messages; used as In-Reply-To / References in outbound sends (KAI-115)';



COMMENT ON COLUMN "public"."messages"."mail_facts" IS 'MailFacts computed from the envelope before routing (apps/api/src/lib/email/mail-facts.ts). Facts, never a judgement.';



COMMENT ON COLUMN "public"."messages"."routing_policy_version" IS 'ROUTING_POLICY_VERSION that decided this message''s route. Scheme in docs/versioning.md.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "ticket_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ticket_note_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oauth_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "granted_by_user_id" "uuid",
    "external_account_id" "text" NOT NULL,
    "access_token_enc" "text",
    "refresh_token_enc" "text",
    "expires_at" timestamp with time zone,
    "scope" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "oauth_credentials_provider_check" CHECK (("provider" = ANY (ARRAY['gmail'::"text", 'instagram'::"text", 'slack'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."oauth_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_learning" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "origin" "text" NOT NULL,
    "status" "text" NOT NULL,
    "learning_type" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "ticket_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "source_count" integer DEFAULT 0 NOT NULL,
    "confidence" double precision,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_key" "text",
    CONSTRAINT "chk_operational_learning_confidence" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision)))),
    CONSTRAINT "chk_operational_learning_origin" CHECK (("origin" = ANY (ARRAY['human_correction'::"text", 'system_derived'::"text"]))),
    CONSTRAINT "chk_operational_learning_source_count" CHECK (("source_count" >= 0)),
    CONSTRAINT "chk_operational_learning_status" CHECK (("status" = ANY (ARRAY['approved'::"text", 'pending_review'::"text", 'rejected'::"text"]))),
    CONSTRAINT "chk_operational_learning_type" CHECK (("learning_type" = ANY (ARRAY['business_fact'::"text", 'resolution'::"text", 'diagnostic_pattern'::"text", 'routing_rule'::"text", 'policy'::"text", 'exception'::"text", 'evaluation_example'::"text"])))
);


ALTER TABLE "public"."operational_learning" OWNER TO "postgres";


COMMENT ON TABLE "public"."operational_learning" IS 'What Kairo has learned from operating one account''s support — resolutions, diagnostic patterns, routing rules and the like. Not kb_articles: that is external documentation the client owns; this is Kairo''s own operational knowledge, scoped to account_id, never shared across accounts today.';



COMMENT ON COLUMN "public"."operational_learning"."origin" IS 'human_correction: a person''s correction is the approval, written already approved. system_derived: Kairo inferred this alone — starts pending_review.';



COMMENT ON COLUMN "public"."operational_learning"."status" IS 'approved rows are usable. pending_review and rejected are not — a caller reads only approved unless it is specifically building the review queue.';



COMMENT ON COLUMN "public"."operational_learning"."ticket_ids" IS 'The tickets this was derived or corrected from. A row with no evidence approves nothing.';



COMMENT ON COLUMN "public"."operational_learning"."confidence" IS 'Null for human_correction — the person''s action is the trust signal, not a score.';



CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "seat_limit_default" integer NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_seat_limit_default_check" CHECK (("seat_limit_default" > 0))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "company_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Extended user profile data for Kairo users';



CREATE TABLE IF NOT EXISTS "public"."response_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text",
    "locale" "text" DEFAULT 'es'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "content_html" "text"
);


ALTER TABLE "public"."response_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."response_templates"."content_html" IS 'HTML version of template content (optional; derived from content if null) (KAI-115)';



CREATE TABLE IF NOT EXISTS "public"."semantic_indexes" (
    "account_id" "uuid" NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "revision" "text" NOT NULL,
    "preparation" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "dimensions" integer NOT NULL,
    "embedding" "extensions"."vector"(768) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "semantic_indexes_dimensions_check" CHECK (("dimensions" = 768)),
    CONSTRAINT "semantic_indexes_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['ticket'::"text", 'kb_article'::"text", 'knowledge_version'::"text"])))
);


ALTER TABLE "public"."semantic_indexes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "channel_type" "text" NOT NULL,
    "email_address" "text" NOT NULL,
    "display_name" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "connected_by_user_id" "uuid",
    "connected_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "credential_id" "uuid",
    CONSTRAINT "support_channels_channel_type_check" CHECK (("channel_type" = ANY (ARRAY['gmail'::"text", 'outlook'::"text", 'imap'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."support_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "timezone" "text" DEFAULT 'America/Bogota'::"text" NOT NULL,
    "account_id" "uuid" NOT NULL,
    CONSTRAINT "support_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."support_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_priority_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weight_type" numeric(3,2) DEFAULT 0.30 NOT NULL,
    "weight_plan" numeric(3,2) DEFAULT 0.35 NOT NULL,
    "weight_emotion" numeric(3,2) DEFAULT 0.20 NOT NULL,
    "weight_age" numeric(3,2) DEFAULT 0.15 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    CONSTRAINT "chk_weights_sum" CHECK (("abs"((((("weight_type" + "weight_plan") + "weight_emotion") + "weight_age") - 1.00)) < 0.01))
);


ALTER TABLE "public"."tenant_priority_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_sla_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_type" "text" NOT NULL,
    "plan_tier" "text" NOT NULL,
    "response_hours" integer NOT NULL,
    "resolution_hours" integer,
    "account_id" "uuid" NOT NULL,
    CONSTRAINT "tenant_sla_rules_plan_tier_check" CHECK (("plan_tier" = ANY (ARRAY['enterprise'::"text", 'pro'::"text", 'starter'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."tenant_sla_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "seq" bigint NOT NULL,
    "domain" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_ref" "text",
    "reason" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb",
    "idempotency_key" "text",
    CONSTRAINT "ticket_activity_log_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['human'::"text", 'ai'::"text", 'customer'::"text", 'system'::"text"]))),
    CONSTRAINT "ticket_activity_log_domain_check" CHECK (("domain" = ANY (ARRAY['tickets'::"text", 'deduplication'::"text", 'grouping'::"text", 'ans'::"text", 'escalation'::"text", 'messaging'::"text"]))),
    CONSTRAINT "ticket_activity_log_event_type_check" CHECK (("event_type" = ANY (ARRAY['assignment'::"text", 'merge'::"text", 'merged_into'::"text", 'grouped'::"text", 'sla_breach'::"text", 'escalated'::"text", 'out_of_hours_auto_reply'::"text", 'customer_reply_on_closed_ticket'::"text"])))
);


ALTER TABLE "public"."ticket_activity_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_activity_log" IS 'Append-only log of non-state ticket facts (assignment, merge, grouping, SLA breach, escalation) shared across domains. account_id is denormalised on purpose so tenant scoping and metrics need no join back to tickets.';



ALTER TABLE "public"."ticket_activity_log" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ticket_activity_log_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ticket_classification_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "seq" bigint NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_ref" "text",
    "dimension" "text" NOT NULL,
    "from_value" "text",
    "to_value" "text",
    "confidence" numeric(3,2),
    "model_version" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb",
    "idempotency_key" "text",
    "applied" boolean NOT NULL,
    CONSTRAINT "ticket_classification_history_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['human'::"text", 'ai'::"text", 'customer'::"text", 'system'::"text"]))),
    CONSTRAINT "ticket_classification_history_dimension_check" CHECK (("dimension" = ANY (ARRAY['category'::"text", 'priority'::"text", 'sentiment'::"text", 'emotion'::"text", 'ticket_type'::"text"])))
);


ALTER TABLE "public"."ticket_classification_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_classification_history" IS 'Append-only ledger of classification decisions on a ticket''s attributes (category/priority/sentiment/emotion/ticket_type) — one row per (ticket, dimension) change, human corrections included. account_id is denormalised on purpose so tenant scoping and metrics need no join back to tickets.';



COMMENT ON COLUMN "public"."ticket_classification_history"."applied" IS 'Whether to_value actually became the ticket''s attribute. true for every AI classification pass and every human correction (both write real, applied values); false only for a rejected AI proposal reviewed via POST /:id/classify-approve, where to_value still records what was proposed and rejected.';



ALTER TABLE "public"."ticket_classification_history" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ticket_classification_history_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ticket_followers" (
    "ticket_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_followers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid" NOT NULL
);


ALTER TABLE "public"."ticket_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_messages" (
    "ticket_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "is_origin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_notes" IS 'Internal notes on a ticket, visible only to agents. Content, not an event trail: UPDATE/DELETE stay open for the author. account_id is denormalised on purpose so tenant scoping needs no join back to tickets.';



CREATE OR REPLACE VIEW "public"."ticket_lifecycle_timeline" WITH ("security_invoker"='true') AS
 SELECT "h"."account_id",
    "h"."ticket_id",
    "h"."occurred_at",
    'state_change'::"text" AS "kind",
    "h"."actor_type",
    COALESCE("h"."actor_ref", ("h"."actor_user_id")::"text") AS "actor_ref",
        CASE
            WHEN ("h"."from_state" IS NULL) THEN "h"."to_state"
            ELSE (("h"."from_state" || ' → '::"text") || "h"."to_state")
        END AS "detail",
    "h"."id"
   FROM "public"."ticket_state_history" "h"
UNION ALL
 SELECT "a"."account_id",
    "a"."ticket_id",
    "a"."occurred_at",
    'activity'::"text" AS "kind",
    "a"."actor_type",
    COALESCE("a"."actor_ref", ("a"."actor_user_id")::"text") AS "actor_ref",
    "a"."event_type" AS "detail",
    "a"."id"
   FROM "public"."ticket_activity_log" "a"
UNION ALL
 SELECT "n"."account_id",
    "n"."ticket_id",
    "n"."created_at" AS "occurred_at",
    'note'::"text" AS "kind",
    'human'::"text" AS "actor_type",
    ("n"."author_id")::"text" AS "actor_ref",
        CASE
            WHEN ("length"("n"."body") > 140) THEN ("left"("n"."body", 140) || '…'::"text")
            ELSE "n"."body"
        END AS "detail",
    "n"."id"
   FROM "public"."ticket_notes" "n"
UNION ALL
 SELECT "c"."account_id",
    "c"."ticket_id",
    "c"."occurred_at",
    'classification'::"text" AS "kind",
    "c"."actor_type",
    COALESCE("c"."actor_ref", ("c"."actor_user_id")::"text") AS "actor_ref",
    (((("c"."dimension" || ': '::"text") || COALESCE("c"."from_value", '—'::"text")) || ' → '::"text") || COALESCE("c"."to_value", '—'::"text")) AS "detail",
    "c"."id"
   FROM "public"."ticket_classification_history" "c"
UNION ALL
 SELECT "m"."account_id",
    "tm"."ticket_id",
    "m"."received_at" AS "occurred_at",
    'message'::"text" AS "kind",
        CASE
            WHEN ("m"."direction" = 'inbound'::"text") THEN 'customer'::"text"
            ELSE 'human'::"text"
        END AS "actor_type",
    "m"."sender_display_name" AS "actor_ref",
    "m"."direction" AS "detail",
    "m"."id"
   FROM ("public"."ticket_messages" "tm"
     JOIN "public"."messages" "m" ON (("m"."id" = "tm"."message_id")));


ALTER VIEW "public"."ticket_lifecycle_timeline" OWNER TO "postgres";


COMMENT ON VIEW "public"."ticket_lifecycle_timeline" IS 'One ordered stream per ticket, unioning ticket_state_history, ticket_activity_log, ticket_notes, ticket_classification_history and messages (via ticket_messages). kind distinguishes the source (state_change/activity/note/classification/message); detail is a short per-source summary; id is each row''s own source-table primary key, exposed only as a stable pagination tie-break for occurred_at ties — it carries no meaning across sources. Composed in SQL on purpose — never reassembled in an endpoint.';



CREATE TABLE IF NOT EXISTS "public"."ticket_note_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "ticket_note_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "notified_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_note_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_priority_sla_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "priority" "text" NOT NULL,
    "max_response_seconds" integer NOT NULL,
    "min_response_seconds" integer NOT NULL,
    "risk_alert_seconds" integer NOT NULL,
    "escalation_seconds" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_ticket_priority_sla_positive" CHECK ((("max_response_seconds" > 0) AND ("min_response_seconds" > 0) AND ("risk_alert_seconds" > 0) AND ("escalation_seconds" > 0) AND ("min_response_seconds" < "max_response_seconds"))),
    CONSTRAINT "chk_ticket_priority_sla_priority" CHECK (("priority" = ANY (ARRAY['P1'::"text", 'P2'::"text", 'P3'::"text"])))
);


ALTER TABLE "public"."ticket_priority_sla_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_priority_sla_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_ticket_priority_sla_events_type" CHECK (("event_type" = ANY (ARRAY['risk_alert'::"text", 'escalated'::"text"])))
);


ALTER TABLE "public"."ticket_priority_sla_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "message_ids" "uuid"[] NOT NULL,
    "proposed_category" "text",
    "proposed_priority" "text",
    "proposed_type" "text",
    "proposed_sentiment" "text",
    "confidence_score" double precision NOT NULL,
    "model_version" "text" NOT NULL,
    "raw_llm_output" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "ticket_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "proposed_emotion" "text",
    "emotion_confidence" numeric(3,2),
    "proposed_reply" "text",
    "referenced_kb_articles" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "escalation_reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "chk_proposed_emotion" CHECK ((("proposed_emotion" IS NULL) OR ("proposed_emotion" = ANY (ARRAY['aggressive'::"text", 'frustrated'::"text", 'neutral'::"text", 'positive'::"text"])))),
    CONSTRAINT "ticket_proposals_confidence_score_check" CHECK ((("confidence_score" >= (0.0)::double precision) AND ("confidence_score" <= (1.0)::double precision)))
);


ALTER TABLE "public"."ticket_proposals" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ticket_state_durations" WITH ("security_invoker"='true') AS
 SELECT "account_id",
    "ticket_id",
    "seq",
    "to_state" AS "state",
    "occurred_at" AS "entered_at",
    "lead"("occurred_at") OVER (PARTITION BY "ticket_id" ORDER BY "seq") AS "exited_at",
    ("lead"("occurred_at") OVER (PARTITION BY "ticket_id" ORDER BY "seq") - "occurred_at") AS "duration"
   FROM "public"."ticket_state_history" "h";


ALTER VIEW "public"."ticket_state_durations" OWNER TO "postgres";


COMMENT ON VIEW "public"."ticket_state_durations" IS 'Per ticket, per state: entered_at/exited_at/duration derived from ticket_state_history via LEAD(occurred_at) OVER (PARTITION BY ticket_id ORDER BY seq). exited_at and duration are NULL for the state the ticket currently occupies.';



ALTER TABLE "public"."ticket_state_history" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ticket_state_history_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ticket_tags" (
    "ticket_id" "uuid" NOT NULL,
    "tag" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_tags" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ticket_transition_override_rates" WITH ("security_invoker"='true') AS
 WITH "transitions" AS (
         SELECT "h"."account_id",
            "h"."ticket_id",
            "h"."seq",
            "h"."actor_type",
            "h"."from_state",
            "h"."to_state",
            "lag"("h"."actor_type") OVER (PARTITION BY "h"."ticket_id" ORDER BY "h"."seq") AS "prev_actor_type"
           FROM "public"."ticket_state_history" "h"
        ), "by_pair" AS (
         SELECT "t"."account_id",
            "t"."from_state",
            "t"."to_state",
            "count"(*) FILTER (WHERE ("t"."prev_actor_type" = ANY (ARRAY['ai'::"text", 'system'::"text"]))) AS "following_ai_or_system",
            "count"(*) FILTER (WHERE (("t"."actor_type" = 'human'::"text") AND ("t"."prev_actor_type" = ANY (ARRAY['ai'::"text", 'system'::"text"])))) AS "overridden_by_human"
           FROM "transitions" "t"
          GROUP BY "t"."account_id", "t"."from_state", "t"."to_state"
        )
 SELECT "account_id",
    "from_state",
    "to_state",
    "following_ai_or_system",
    "overridden_by_human",
        CASE
            WHEN ("following_ai_or_system" > 0) THEN "round"((("overridden_by_human")::numeric / ("following_ai_or_system")::numeric), 4)
            ELSE NULL::numeric
        END AS "override_rate"
   FROM "by_pair";


ALTER VIEW "public"."ticket_transition_override_rates" OWNER TO "postgres";


COMMENT ON VIEW "public"."ticket_transition_override_rates" IS 'How often a human transition immediately follows one made by ai/system on the same ticket (LAG(actor_type) OVER ticket_id ORDER BY seq), grouped by the (from_state, to_state) pair of the following transition. override_rate = overridden_by_human / following_ai_or_system.';



CREATE TABLE IF NOT EXISTS "public"."ticket_transition_rules" (
    "from_state" "text" NOT NULL,
    "to_state" "text" NOT NULL,
    CONSTRAINT "ticket_transition_rules_from_state_check" CHECK (("from_state" = ANY (ARRAY['open'::"text", 'awaiting_customer'::"text", 'in_progress'::"text", 'resolved'::"text", 'ai_resolved'::"text", 'escalated'::"text", 'reopened'::"text", 'closed'::"text"]))),
    CONSTRAINT "ticket_transition_rules_to_state_check" CHECK (("to_state" = ANY (ARRAY['open'::"text", 'awaiting_customer'::"text", 'in_progress'::"text", 'resolved'::"text", 'ai_resolved'::"text", 'escalated'::"text", 'reopened'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."ticket_transition_rules" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_transition_rules" IS 'Mirrors ALLOWED_TRANSITIONS from apps/api/src/lib/ticket-status-machine.ts. Generated by apps/api/src/lib/ticket-transition-rules-sql.ts — never hand-edited. Read by apply_ticket_transition(); ticket-transition-rules-sql.test.ts asserts this seed stays byte-for-byte in sync with the TypeScript table.';



CREATE TABLE IF NOT EXISTS "public"."ticket_type_auto_approval" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_type" "text" NOT NULL,
    "min_precision" double precision DEFAULT 0.90 NOT NULL,
    "min_sample_size" integer DEFAULT 30 NOT NULL,
    "current_precision" double precision,
    "current_sample_count" integer DEFAULT 0 NOT NULL,
    "auto_approval_enabled" boolean DEFAULT false NOT NULL,
    "last_evaluated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_tta_min_precision" CHECK ((("min_precision" >= (0.5)::double precision) AND ("min_precision" <= (1.0)::double precision))),
    CONSTRAINT "chk_tta_min_sample" CHECK (("min_sample_size" > 0)),
    CONSTRAINT "chk_tta_ticket_type" CHECK (("ticket_type" = ANY (ARRAY['support'::"text", 'prospect'::"text", 'spam'::"text", 'internal'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."ticket_type_auto_approval" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_type_auto_approval" IS 'Per-account, per-ticket_type permission to let a classification stand without human review. Earned from measured precision over a minimum sample, never set by hand — see ADR-027. The 0.90 default is where all five bench models land on `support`; 30 is the sample below which a perfect run says nothing (granite scored 100% on 4 predictions of `internal`).';



COMMENT ON COLUMN "public"."ticket_type_auto_approval"."min_precision" IS 'Precision the class must reach before it auto-approves. Precision of the PREDICTION, not the confidence the model reports about itself — that number was measured and does not separate right from wrong (ADR-027).';



ALTER TABLE "public"."tickets" ALTER COLUMN "ticket_number" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tickets_ticket_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."worker_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker" "text" NOT NULL,
    "account_id" "uuid",
    "trigger_event" "text",
    "trigger_payload" "jsonb",
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "result" "jsonb",
    "error" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_runs_finished_consistency" CHECK (((("status" = 'running'::"text") AND ("finished_at" IS NULL)) OR (("status" <> 'running'::"text") AND ("finished_at" IS NOT NULL)))),
    CONSTRAINT "worker_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."worker_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."worker_runs" IS 'Observabilidad genérica de runs de workers Inngest. Una fila por ejecución. Worker-agnóstica. KAI-225.';



CREATE OR REPLACE VIEW "public"."workflow_metrics" WITH ("security_invoker"='true') AS
 SELECT "h"."account_id",
    "h"."contract",
    "count"(*) AS "evaluations",
    "count"(DISTINCT "h"."ticket_id") AS "tickets_evaluated",
    "count"(*) FILTER (WHERE ("h"."status" = 'pending_knowledge'::"text")) AS "pending_knowledge",
    "count"(*) FILTER (WHERE ("h"."status" = 'evaluated_without_contribution'::"text")) AS "without_contribution",
    "count"(*) FILTER (WHERE ("h"."status" = 'enriched'::"text")) AS "applied",
    "count"(*) FILTER (WHERE ("h"."status" = 'approved'::"text")) AS "accepted",
    "count"(*) FILTER (WHERE ("h"."status" = 'rejected'::"text")) AS "rejected",
    "count"(*) FILTER (WHERE ("h"."status" = 'pending_human_review'::"text")) AS "proposed",
    "count"(*) FILTER (WHERE (("h"."knowledge_version_id" IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."current_knowledge" "k"
          WHERE ("k"."id" = "h"."knowledge_version_id")))))) AS "superseded_evaluations",
    "sum"(("c"."prompt_tokens" + "c"."completion_tokens")) FILTER (WHERE ("h"."status" = 'evaluated_without_contribution'::"text")) AS "no_contribution_tokens",
    "sum"("c"."latency_ms") FILTER (WHERE ("h"."status" = 'evaluated_without_contribution'::"text")) AS "no_contribution_latency_ms"
   FROM ("public"."ticket_decision_history" "h"
     LEFT JOIN "public"."llm_calls" "c" ON (((("c"."id")::"text" = ("h"."result" ->> 'callId'::"text")) AND ("c"."account_id" = "h"."account_id"))))
  GROUP BY "h"."account_id", "h"."contract";


ALTER VIEW "public"."workflow_metrics" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_invitations"
    ADD CONSTRAINT "account_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."account_invitations"
    ADD CONSTRAINT "account_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."account_members"
    ADD CONSTRAINT "account_members_account_user_unique" UNIQUE ("account_id", "user_id");



ALTER TABLE ONLY "public"."account_members"
    ADD CONSTRAINT "account_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_auth_uid_key" UNIQUE ("auth_uid");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorization_feedback"
    ADD CONSTRAINT "categorization_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_integrations"
    ADD CONSTRAINT "channel_integrations_account_provider_external_key" UNIQUE ("account_id", "provider", "external_account_id");



ALTER TABLE ONLY "public"."channel_integrations"
    ADD CONSTRAINT "channel_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classification_feedback"
    ADD CONSTRAINT "classification_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_account_id_internal_id_key" UNIQUE ("account_id", "internal_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."csat_events"
    ADD CONSTRAINT "csat_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decision_work_breaker"
    ADD CONSTRAINT "decision_work_breaker_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decision_work_items"
    ADD CONSTRAINT "decision_work_items_account_id_dedupe_key_key" UNIQUE ("account_id", "dedupe_key");



ALTER TABLE ONLY "public"."decision_work_items"
    ADD CONSTRAINT "decision_work_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decision_work_outcomes"
    ADD CONSTRAINT "decision_work_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_contact_audit_log"
    ADD CONSTRAINT "draft_contact_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_contact"
    ADD CONSTRAINT "draft_contact_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_contacts"
    ADD CONSTRAINT "escalation_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalations"
    ADD CONSTRAINT "escalations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kb_articles"
    ADD CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_candidate_runs"
    ADD CONSTRAINT "knowledge_candidate_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_embeddings"
    ADD CONSTRAINT "knowledge_embeddings_pkey" PRIMARY KEY ("version_id");



ALTER TABLE ONLY "public"."knowledge_versions"
    ADD CONSTRAINT "knowledge_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."llm_calls"
    ADD CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_integration_external_id_key" UNIQUE ("channel_integration_id", "external_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_credentials"
    ADD CONSTRAINT "oauth_credentials_account_id_provider_external_account_id_key" UNIQUE ("account_id", "provider", "external_account_id");



ALTER TABLE ONLY "public"."oauth_credentials"
    ADD CONSTRAINT "oauth_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_learning"
    ADD CONSTRAINT "operational_learning_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."semantic_indexes"
    ADD CONSTRAINT "semantic_indexes_pkey" PRIMARY KEY ("account_id", "source_kind", "source_id");



ALTER TABLE ONLY "public"."support_channels"
    ADD CONSTRAINT "support_channels_account_email_unique" UNIQUE ("account_id", "email_address");



ALTER TABLE ONLY "public"."support_channels"
    ADD CONSTRAINT "support_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_schedules"
    ADD CONSTRAINT "support_schedules_account_id_day_of_week_key" UNIQUE ("account_id", "day_of_week");



ALTER TABLE ONLY "public"."support_schedules"
    ADD CONSTRAINT "support_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_priority_config"
    ADD CONSTRAINT "tenant_priority_config_account_id_key" UNIQUE ("account_id");



ALTER TABLE ONLY "public"."tenant_priority_config"
    ADD CONSTRAINT "tenant_priority_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_sla_rules"
    ADD CONSTRAINT "tenant_sla_rules_account_id_ticket_type_plan_tier_key" UNIQUE ("account_id", "ticket_type", "plan_tier");



ALTER TABLE ONLY "public"."tenant_sla_rules"
    ADD CONSTRAINT "tenant_sla_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_account_id_idempotency_key_key" UNIQUE ("account_id", "idempotency_key");



ALTER TABLE ONLY "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_classification_history"
    ADD CONSTRAINT "ticket_classification_history_account_id_idempotency_key_key" UNIQUE ("account_id", "idempotency_key");



ALTER TABLE ONLY "public"."ticket_classification_history"
    ADD CONSTRAINT "ticket_classification_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_decision_history"
    ADD CONSTRAINT "ticket_decision_history_account_id_idempotency_key_key" UNIQUE ("account_id", "idempotency_key");



ALTER TABLE ONLY "public"."ticket_decision_history"
    ADD CONSTRAINT "ticket_decision_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_followers"
    ADD CONSTRAINT "ticket_followers_pkey" PRIMARY KEY ("ticket_id", "user_id");



ALTER TABLE ONLY "public"."ticket_groups"
    ADD CONSTRAINT "ticket_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("ticket_id", "message_id");



ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_note_user_key" UNIQUE ("ticket_note_id", "mentioned_user_id");



ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_priority_sla_config"
    ADD CONSTRAINT "ticket_priority_sla_config_account_priority_key" UNIQUE ("account_id", "priority");



ALTER TABLE ONLY "public"."ticket_priority_sla_config"
    ADD CONSTRAINT "ticket_priority_sla_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_priority_sla_events"
    ADD CONSTRAINT "ticket_priority_sla_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_priority_sla_events"
    ADD CONSTRAINT "ticket_priority_sla_events_ticket_event_key" UNIQUE ("ticket_id", "event_type");



ALTER TABLE ONLY "public"."ticket_proposals"
    ADD CONSTRAINT "ticket_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_state_history"
    ADD CONSTRAINT "ticket_state_history_account_id_idempotency_key_key" UNIQUE ("account_id", "idempotency_key");



ALTER TABLE ONLY "public"."ticket_state_history"
    ADD CONSTRAINT "ticket_state_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_tags"
    ADD CONSTRAINT "ticket_tags_pkey" PRIMARY KEY ("ticket_id", "tag");



ALTER TABLE ONLY "public"."ticket_transition_rules"
    ADD CONSTRAINT "ticket_transition_rules_pkey" PRIMARY KEY ("from_state", "to_state");



ALTER TABLE ONLY "public"."ticket_type_auto_approval"
    ADD CONSTRAINT "ticket_type_auto_approval_account_type_key" UNIQUE ("account_id", "ticket_type");



ALTER TABLE ONLY "public"."ticket_type_auto_approval"
    ADD CONSTRAINT "ticket_type_auto_approval_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_ticket_number_key" UNIQUE ("ticket_number");



ALTER TABLE ONLY "public"."worker_runs"
    ADD CONSTRAINT "worker_runs_pkey" PRIMARY KEY ("id");



CREATE INDEX "decision_work_outcomes_recent" ON "public"."decision_work_outcomes" USING "btree" ("recorded_at");



CREATE INDEX "decision_work_pending" ON "public"."decision_work_items" USING "btree" ("status", "available_at");



CREATE INDEX "idx_admin_audit_log_admin_user_id" ON "public"."admin_audit_log" USING "btree" ("admin_user_id");



CREATE INDEX "idx_admin_audit_log_target" ON "public"."admin_audit_log" USING "btree" ("target_table", "target_id");



CREATE INDEX "idx_admin_users_auth_uid" ON "public"."admin_users" USING "btree" ("auth_uid");



CREATE INDEX "idx_categorization_feedback_created_at" ON "public"."categorization_feedback" USING "btree" ("created_at");



CREATE INDEX "idx_categorization_feedback_is_correction" ON "public"."categorization_feedback" USING "btree" ("is_correction");



CREATE INDEX "idx_categorization_feedback_model_version" ON "public"."categorization_feedback" USING "btree" ("model_version");



CREATE INDEX "idx_categorization_feedback_outcome" ON "public"."categorization_feedback" USING "btree" ("outcome");



CREATE INDEX "idx_categorization_feedback_predicted_category" ON "public"."categorization_feedback" USING "btree" ("predicted_category");



CREATE INDEX "idx_channel_integrations_account_id" ON "public"."channel_integrations" USING "btree" ("account_id");



CREATE INDEX "idx_channel_integrations_provider" ON "public"."channel_integrations" USING "btree" ("provider");



CREATE INDEX "idx_classification_feedback_account_id" ON "public"."classification_feedback" USING "btree" ("account_id");



CREATE INDEX "idx_classification_feedback_created_at" ON "public"."classification_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_classification_feedback_submitted_by" ON "public"."classification_feedback" USING "btree" ("submitted_by_user_id");



CREATE INDEX "idx_classification_feedback_ticket_id" ON "public"."classification_feedback" USING "btree" ("ticket_id");



CREATE INDEX "idx_clients_account_id" ON "public"."clients" USING "btree" ("account_id");



CREATE INDEX "idx_clients_name" ON "public"."clients" USING "btree" ("account_id", "name");



CREATE UNIQUE INDEX "idx_conversations_account_channel_thread" ON "public"."conversations" USING "btree" ("account_id", "channel_integration_id", "external_thread_id") WHERE ("external_thread_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_conversations_account_channel_thread" IS 'KAI-165: 1 thread = 1 conversation, partial unique for thread-bearing rows.';



CREATE INDEX "idx_conversations_account_id" ON "public"."conversations" USING "btree" ("account_id");



CREATE INDEX "idx_conversations_channel_integration_id" ON "public"."conversations" USING "btree" ("channel_integration_id");



CREATE INDEX "idx_conversations_customer_external_id" ON "public"."conversations" USING "btree" ("customer_external_id");



CREATE INDEX "idx_conversations_external_thread_id" ON "public"."conversations" USING "btree" ("external_thread_id") WHERE ("external_thread_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_draft_contact_account_email" ON "public"."draft_contact" USING "btree" ("account_id", "email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_draft_contact_account_org" ON "public"."draft_contact" USING "btree" ("account_id", "organization") WHERE ("organization" IS NOT NULL);



CREATE UNIQUE INDEX "idx_draft_contact_account_phone" ON "public"."draft_contact" USING "btree" ("account_id", "phone") WHERE ("phone" IS NOT NULL);



CREATE INDEX "idx_draft_contact_account_status" ON "public"."draft_contact" USING "btree" ("account_id", "status");



CREATE INDEX "idx_draft_contact_audit_account_created" ON "public"."draft_contact_audit_log" USING "btree" ("account_id", "created_at" DESC);



CREATE INDEX "idx_draft_contact_audit_draft_created" ON "public"."draft_contact_audit_log" USING "btree" ("draft_id", "created_at" DESC);



CREATE INDEX "idx_draft_contact_metadata_gin" ON "public"."draft_contact" USING "gin" ("metadata");



CREATE INDEX "idx_draft_contact_source_tickets_gin" ON "public"."draft_contact" USING "gin" ("source_tickets");



CREATE INDEX "idx_escalation_contacts_account_id" ON "public"."escalation_contacts" USING "btree" ("account_id");



CREATE INDEX "idx_kb_articles_account_id" ON "public"."kb_articles" USING "btree" ("account_id");



CREATE INDEX "idx_kb_articles_embedding" ON "public"."kb_articles" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "idx_llm_calls_account_id" ON "public"."llm_calls" USING "btree" ("account_id");



CREATE INDEX "idx_llm_calls_created_at" ON "public"."llm_calls" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_llm_calls_feature" ON "public"."llm_calls" USING "btree" ("feature");



CREATE INDEX "idx_llm_calls_model" ON "public"."llm_calls" USING "btree" ("model");



CREATE INDEX "idx_llm_calls_outcome" ON "public"."llm_calls" USING "btree" ("outcome") WHERE ("outcome" IS NOT NULL);



CREATE INDEX "idx_llm_calls_prompt_version" ON "public"."llm_calls" USING "btree" ("feature", "prompt_version");



CREATE INDEX "idx_llm_calls_ticket_id" ON "public"."llm_calls" USING "btree" ("ticket_id");



CREATE INDEX "idx_messages_account_id" ON "public"."messages" USING "btree" ("account_id");



CREATE INDEX "idx_messages_classification_status" ON "public"."messages" USING "btree" ("classification_status");



CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_direction" ON "public"."messages" USING "btree" ("direction");



CREATE INDEX "idx_messages_processing_batch" ON "public"."messages" USING "btree" ("processing_batch");



CREATE INDEX "idx_messages_processing_tier" ON "public"."messages" USING "btree" ("processing_tier");



CREATE INDEX "idx_messages_received_at" ON "public"."messages" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_messages_thread_external_id" ON "public"."messages" USING "btree" ("thread_external_id");



CREATE INDEX "idx_notifications_account_id" ON "public"."notifications" USING "btree" ("account_id");



CREATE INDEX "idx_notifications_recipient_user_id" ON "public"."notifications" USING "btree" ("recipient_user_id");



CREATE INDEX "idx_oauth_credentials_account_provider" ON "public"."oauth_credentials" USING "btree" ("account_id", "provider");



CREATE INDEX "idx_oauth_credentials_expires_at" ON "public"."oauth_credentials" USING "btree" ("expires_at");



CREATE INDEX "idx_oauth_credentials_granted_by" ON "public"."oauth_credentials" USING "btree" ("granted_by_user_id");



CREATE INDEX "idx_operational_learning_account_status" ON "public"."operational_learning" USING "btree" ("account_id", "status");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_response_templates_account_id" ON "public"."response_templates" USING "btree" ("account_id") WHERE ("is_active" = true);



CREATE INDEX "idx_response_templates_locale" ON "public"."response_templates" USING "btree" ("account_id", "locale") WHERE ("is_active" = true);



CREATE INDEX "idx_support_channels_account_id" ON "public"."support_channels" USING "btree" ("account_id");



CREATE INDEX "idx_support_channels_credential_id" ON "public"."support_channels" USING "btree" ("credential_id");



CREATE INDEX "idx_support_channels_is_active" ON "public"."support_channels" USING "btree" ("account_id", "is_active");



CREATE INDEX "idx_support_schedules_account_id" ON "public"."support_schedules" USING "btree" ("account_id");



CREATE INDEX "idx_tenant_priority_config_account_id" ON "public"."tenant_priority_config" USING "btree" ("account_id");



CREATE INDEX "idx_tenant_sla_rules_account_id" ON "public"."tenant_sla_rules" USING "btree" ("account_id");



CREATE INDEX "idx_ticket_activity_log_account_occurred" ON "public"."ticket_activity_log" USING "btree" ("account_id", "occurred_at");



CREATE INDEX "idx_ticket_activity_log_ticket_seq" ON "public"."ticket_activity_log" USING "btree" ("ticket_id", "seq");



CREATE INDEX "idx_ticket_classification_history_account_occurred" ON "public"."ticket_classification_history" USING "btree" ("account_id", "occurred_at");



CREATE INDEX "idx_ticket_classification_history_ticket_seq" ON "public"."ticket_classification_history" USING "btree" ("ticket_id", "seq");



CREATE INDEX "idx_ticket_groups_account_id" ON "public"."ticket_groups" USING "btree" ("account_id");



CREATE INDEX "idx_ticket_messages_message_id" ON "public"."ticket_messages" USING "btree" ("message_id");



CREATE INDEX "idx_ticket_note_mentions_ticket" ON "public"."ticket_note_mentions" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_note_mentions_user" ON "public"."ticket_note_mentions" USING "btree" ("mentioned_user_id", "read_at");



CREATE INDEX "idx_ticket_notes_account_created" ON "public"."ticket_notes" USING "btree" ("account_id", "created_at");



CREATE INDEX "idx_ticket_notes_ticket" ON "public"."ticket_notes" USING "btree" ("ticket_id", "created_at");



CREATE INDEX "idx_ticket_priority_sla_config_account_id" ON "public"."ticket_priority_sla_config" USING "btree" ("account_id");



CREATE INDEX "idx_ticket_priority_sla_events_account_id" ON "public"."ticket_priority_sla_events" USING "btree" ("account_id");



CREATE INDEX "idx_ticket_priority_sla_events_ticket_id" ON "public"."ticket_priority_sla_events" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_proposals_confidence_score" ON "public"."ticket_proposals" USING "btree" ("confidence_score");



CREATE INDEX "idx_ticket_proposals_conversation_id" ON "public"."ticket_proposals" USING "btree" ("conversation_id");



CREATE INDEX "idx_ticket_proposals_model_version" ON "public"."ticket_proposals" USING "btree" ("model_version");



CREATE INDEX "idx_ticket_proposals_status" ON "public"."ticket_proposals" USING "btree" ("status");



CREATE INDEX "idx_ticket_state_history_account_occurred" ON "public"."ticket_state_history" USING "btree" ("account_id", "occurred_at");



CREATE INDEX "idx_ticket_state_history_ticket_seq" ON "public"."ticket_state_history" USING "btree" ("ticket_id", "seq");



CREATE INDEX "idx_ticket_tags_tag" ON "public"."ticket_tags" USING "btree" ("tag");



CREATE UNIQUE INDEX "idx_tickets_account_conversation_active" ON "public"."tickets" USING "btree" ("account_id", "conversation_id") WHERE (("conversation_id" IS NOT NULL) AND ("merged_into_ticket_id" IS NULL));



COMMENT ON INDEX "public"."idx_tickets_account_conversation_active" IS 'KAI-165: prevents concurrent ingestion from creating 2 tickets for the same conversation.';



CREATE INDEX "idx_tickets_account_id" ON "public"."tickets" USING "btree" ("account_id");



CREATE INDEX "idx_tickets_account_priority_score" ON "public"."tickets" USING "btree" ("account_id", "priority_score" DESC NULLS LAST);



CREATE INDEX "idx_tickets_assigned_to" ON "public"."tickets" USING "btree" ("assigned_to");



CREATE INDEX "idx_tickets_auto_replied_thread" ON "public"."tickets" USING "btree" ("account_id", "gmail_thread_id") WHERE ("auto_replied_out_of_hours" = true);



CREATE INDEX "idx_tickets_client_id" ON "public"."tickets" USING "btree" ("client_id");



CREATE INDEX "idx_tickets_conversation_id" ON "public"."tickets" USING "btree" ("conversation_id");



CREATE INDEX "idx_tickets_embedding" ON "public"."tickets" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "idx_tickets_gmail_message_id" ON "public"."tickets" USING "btree" ("gmail_message_id");



CREATE INDEX "idx_tickets_received_at" ON "public"."tickets" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_tickets_sla_due_at" ON "public"."tickets" USING "btree" ("sla_due_at");



CREATE INDEX "idx_tickets_status" ON "public"."tickets" USING "btree" ("status");



CREATE INDEX "idx_tickets_ticket_number" ON "public"."tickets" USING "btree" ("ticket_number");



CREATE INDEX "idx_worker_runs_account_worker_started" ON "public"."worker_runs" USING "btree" ("account_id", "worker", "started_at" DESC);



CREATE INDEX "idx_worker_runs_status_running" ON "public"."worker_runs" USING "btree" ("started_at") WHERE ("status" = 'running'::"text");



CREATE UNIQUE INDEX "kb_articles_source_key" ON "public"."kb_articles" USING "btree" ("account_id", "source_key");



CREATE INDEX "knowledge_candidate_runs_account" ON "public"."knowledge_candidate_runs" USING "btree" ("account_id", "created_at" DESC);



CREATE INDEX "knowledge_embeddings_vector" ON "public"."knowledge_embeddings" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "knowledge_versions_source" ON "public"."knowledge_versions" USING "btree" ("account_id", "source_kind", "source_id", "revision" DESC);



CREATE UNIQUE INDEX "operational_learning_source_key" ON "public"."operational_learning" USING "btree" ("account_id", "source_key");



CREATE INDEX "semantic_indexes_vectors" ON "public"."semantic_indexes" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "ticket_decision_history_ticket" ON "public"."ticket_decision_history" USING "btree" ("account_id", "ticket_id", "created_at" DESC);



CREATE INDEX "tickets_account_short_id_idx" ON "public"."tickets" USING "btree" ("account_id", "short_id");



CREATE INDEX "tickets_group_id_idx" ON "public"."tickets" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "guard_tickets_status_change" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."guard_tickets_status_change"();



CREATE OR REPLACE TRIGGER "kb_version" AFTER INSERT OR DELETE OR UPDATE ON "public"."kb_articles" FOR EACH ROW EXECUTE FUNCTION "public"."record_knowledge_version"();



CREATE OR REPLACE TRIGGER "knowledge_versions_immutable" BEFORE DELETE OR UPDATE ON "public"."knowledge_versions" FOR EACH ROW EXECUTE FUNCTION "public"."reject_decision_history_mutation"();



CREATE OR REPLACE TRIGGER "knowledge_versions_no_truncate" BEFORE TRUNCATE ON "public"."knowledge_versions" FOR EACH STATEMENT EXECUTE FUNCTION "public"."reject_decision_history_mutation"();



CREATE OR REPLACE TRIGGER "learning_version" AFTER INSERT OR DELETE OR UPDATE ON "public"."operational_learning" FOR EACH ROW EXECUTE FUNCTION "public"."record_knowledge_version"();



CREATE OR REPLACE TRIGGER "message_decision_enqueue" AFTER INSERT ON "public"."ticket_messages" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_message_decision"();



CREATE OR REPLACE TRIGGER "on_channel_integrations_updated" BEFORE UPDATE ON "public"."channel_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_clients_updated" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_conversations_updated" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_oauth_credentials_updated" BEFORE UPDATE ON "public"."oauth_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_operational_learning_updated" BEFORE UPDATE ON "public"."operational_learning" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_response_templates_updated" BEFORE UPDATE ON "public"."response_templates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_ticket_notes_updated" BEFORE UPDATE ON "public"."ticket_notes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_ticket_type_auto_approval_updated" BEFORE UPDATE ON "public"."ticket_type_auto_approval" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_tickets_updated" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "ticket_activity_log_append_only" BEFORE DELETE OR UPDATE ON "public"."ticket_activity_log" FOR EACH ROW EXECUTE FUNCTION "public"."reject_ticket_activity_log_mutation"();



CREATE OR REPLACE TRIGGER "ticket_case_revision" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."advance_case_revision"();



CREATE OR REPLACE TRIGGER "ticket_classification_history_append_only" BEFORE DELETE OR UPDATE ON "public"."ticket_classification_history" FOR EACH ROW EXECUTE FUNCTION "public"."reject_ticket_classification_history_mutation"();



CREATE OR REPLACE TRIGGER "ticket_decision_capture" AFTER INSERT OR UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."capture_ticket_decision"();



CREATE OR REPLACE TRIGGER "ticket_decision_history_immutable" BEFORE DELETE OR UPDATE ON "public"."ticket_decision_history" FOR EACH ROW EXECUTE FUNCTION "public"."reject_decision_history_mutation"();



CREATE OR REPLACE TRIGGER "ticket_decisions_no_truncate" BEFORE TRUNCATE ON "public"."ticket_decision_history" FOR EACH STATEMENT EXECUTE FUNCTION "public"."reject_decision_history_mutation"();



CREATE OR REPLACE TRIGGER "ticket_state_history_append_only" BEFORE DELETE OR UPDATE ON "public"."ticket_state_history" FOR EACH ROW EXECUTE FUNCTION "public"."reject_ticket_state_history_mutation"();



CREATE OR REPLACE TRIGGER "trg_accounts_default_plan_id" BEFORE INSERT ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_plan_id_on_accounts"();



CREATE OR REPLACE TRIGGER "trg_draft_contact_updated_at" BEFORE UPDATE ON "public"."draft_contact" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_plans_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_plans_updated_at"();



ALTER TABLE ONLY "public"."account_invitations"
    ADD CONSTRAINT "account_invitations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_invitations"
    ADD CONSTRAINT "account_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."account_members"
    ADD CONSTRAINT "account_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_members"
    ADD CONSTRAINT "account_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id");



ALTER TABLE ONLY "public"."categorization_feedback"
    ADD CONSTRAINT "categorization_feedback_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."ticket_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorization_feedback"
    ADD CONSTRAINT "categorization_feedback_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."channel_integrations"
    ADD CONSTRAINT "channel_integrations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classification_feedback"
    ADD CONSTRAINT "classification_feedback_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classification_feedback"
    ADD CONSTRAINT "classification_feedback_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."classification_feedback"
    ADD CONSTRAINT "classification_feedback_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classification_feedback"
    ADD CONSTRAINT "classification_feedback_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_channel_integration_id_fkey" FOREIGN KEY ("channel_integration_id") REFERENCES "public"."channel_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."csat_events"
    ADD CONSTRAINT "csat_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."decision_work_items"
    ADD CONSTRAINT "decision_work_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."decision_work_items"
    ADD CONSTRAINT "decision_work_items_knowledge_version_id_fkey" FOREIGN KEY ("knowledge_version_id") REFERENCES "public"."knowledge_versions"("id");



ALTER TABLE ONLY "public"."decision_work_items"
    ADD CONSTRAINT "decision_work_items_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id");



ALTER TABLE ONLY "public"."decision_work_items"
    ADD CONSTRAINT "decision_work_items_requeued_by_fkey" FOREIGN KEY ("requeued_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."decision_work_items"
    ADD CONSTRAINT "decision_work_items_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."draft_contact"
    ADD CONSTRAINT "draft_contact_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_contact_audit_log"
    ADD CONSTRAINT "draft_contact_audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_contact_audit_log"
    ADD CONSTRAINT "draft_contact_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."draft_contact_audit_log"
    ADD CONSTRAINT "draft_contact_audit_log_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "public"."draft_contact"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_contact"
    ADD CONSTRAINT "draft_contact_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."draft_contact"
    ADD CONSTRAINT "draft_contact_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "public"."draft_contact"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."escalation_contacts"
    ADD CONSTRAINT "escalation_contacts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escalations"
    ADD CONSTRAINT "escalations_escalated_by_fkey" FOREIGN KEY ("escalated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."escalations"
    ADD CONSTRAINT "escalations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."kb_articles"
    ADD CONSTRAINT "kb_articles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kb_articles"
    ADD CONSTRAINT "kb_articles_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."knowledge_candidate_runs"
    ADD CONSTRAINT "knowledge_candidate_runs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_candidate_runs"
    ADD CONSTRAINT "knowledge_candidate_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."knowledge_versions"("id");



ALTER TABLE ONLY "public"."knowledge_embeddings"
    ADD CONSTRAINT "knowledge_embeddings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_embeddings"
    ADD CONSTRAINT "knowledge_embeddings_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."knowledge_versions"("id");



ALTER TABLE ONLY "public"."knowledge_versions"
    ADD CONSTRAINT "knowledge_versions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."knowledge_versions"
    ADD CONSTRAINT "knowledge_versions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."llm_calls"
    ADD CONSTRAINT "llm_calls_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."llm_calls"
    ADD CONSTRAINT "llm_calls_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."llm_calls"
    ADD CONSTRAINT "llm_calls_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_channel_integration_id_fkey" FOREIGN KEY ("channel_integration_id") REFERENCES "public"."channel_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_ticket_note_id_fkey" FOREIGN KEY ("ticket_note_id") REFERENCES "public"."ticket_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_credentials"
    ADD CONSTRAINT "oauth_credentials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_credentials"
    ADD CONSTRAINT "oauth_credentials_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_learning"
    ADD CONSTRAINT "operational_learning_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_learning"
    ADD CONSTRAINT "operational_learning_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."semantic_indexes"
    ADD CONSTRAINT "semantic_indexes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_channels"
    ADD CONSTRAINT "support_channels_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_channels"
    ADD CONSTRAINT "support_channels_connected_by_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_channels"
    ADD CONSTRAINT "support_channels_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "public"."oauth_credentials"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_schedules"
    ADD CONSTRAINT "support_schedules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_priority_config"
    ADD CONSTRAINT "tenant_priority_config_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_sla_rules"
    ADD CONSTRAINT "tenant_sla_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_classification_history"
    ADD CONSTRAINT "ticket_classification_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."ticket_classification_history"
    ADD CONSTRAINT "ticket_classification_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_classification_history"
    ADD CONSTRAINT "ticket_classification_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_decision_history"
    ADD CONSTRAINT "ticket_decision_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."ticket_decision_history"
    ADD CONSTRAINT "ticket_decision_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ticket_decision_history"
    ADD CONSTRAINT "ticket_decision_history_knowledge_version_id_fkey" FOREIGN KEY ("knowledge_version_id") REFERENCES "public"."knowledge_versions"("id");



ALTER TABLE ONLY "public"."ticket_decision_history"
    ADD CONSTRAINT "ticket_decision_history_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id");



ALTER TABLE ONLY "public"."ticket_decision_history"
    ADD CONSTRAINT "ticket_decision_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."ticket_followers"
    ADD CONSTRAINT "ticket_followers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_followers"
    ADD CONSTRAINT "ticket_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_groups"
    ADD CONSTRAINT "ticket_groups_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_ticket_note_id_fkey" FOREIGN KEY ("ticket_note_id") REFERENCES "public"."ticket_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_priority_sla_config"
    ADD CONSTRAINT "ticket_priority_sla_config_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_priority_sla_events"
    ADD CONSTRAINT "ticket_priority_sla_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_priority_sla_events"
    ADD CONSTRAINT "ticket_priority_sla_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_proposals"
    ADD CONSTRAINT "ticket_proposals_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_proposals"
    ADD CONSTRAINT "ticket_proposals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_proposals"
    ADD CONSTRAINT "ticket_proposals_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_state_history"
    ADD CONSTRAINT "ticket_state_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."ticket_state_history"
    ADD CONSTRAINT "ticket_state_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_state_history"
    ADD CONSTRAINT "ticket_state_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_tags"
    ADD CONSTRAINT "ticket_tags_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_type_auto_approval"
    ADD CONSTRAINT "ticket_type_auto_approval_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."ticket_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_merged_into_ticket_id_fkey" FOREIGN KEY ("merged_into_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_originating_user_id_fkey" FOREIGN KEY ("originating_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_parent_ticket_id_fkey" FOREIGN KEY ("parent_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."worker_runs"
    ADD CONSTRAINT "worker_runs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



CREATE POLICY "Account admins can manage members" ON "public"."account_members" USING ("public"."is_account_admin"("account_id"));



CREATE POLICY "Accounts are viewable by members" ON "public"."accounts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."account_members"
  WHERE (("account_members"."account_id" = "accounts"."id") AND ("account_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Accounts can be managed by owners and admins" ON "public"."accounts" USING ((EXISTS ( SELECT 1
   FROM "public"."account_members"
  WHERE (("account_members"."account_id" = "accounts"."id") AND ("account_members"."user_id" = "auth"."uid"()) AND ("account_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Authenticated users can read categorization_feedback" ON "public"."categorization_feedback" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Invitations can be managed by account admins" ON "public"."account_invitations" USING ("public"."is_account_admin"("account_id"));



CREATE POLICY "Invitations can be viewed by the invited user" ON "public"."account_invitations" FOR SELECT USING (("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



CREATE POLICY "Invited user can delete own invitation" ON "public"."account_invitations" FOR DELETE USING (("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



CREATE POLICY "Members can view teammates" ON "public"."account_members" FOR SELECT USING ("public"."has_account_access"("account_id"));



CREATE POLICY "Members can view their own account memberships" ON "public"."account_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Plans are viewable by authenticated users" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can accept own invitation" ON "public"."account_members" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'active'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."account_invitations" "ai"
  WHERE (("ai"."account_id" = "account_members"."account_id") AND ("ai"."email" = (( SELECT "users"."email"
           FROM "auth"."users"
          WHERE ("users"."id" = "auth"."uid"())))::"text") AND ("ai"."role" = "account_members"."role") AND ("ai"."expires_at" > "now"()))))));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."account_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."account_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_audit_log_read" ON "public"."admin_audit_log" FOR SELECT USING (("auth"."uid"() IN ( SELECT "admin_users"."auth_uid"
   FROM "public"."admin_users"
  WHERE ("admin_users"."is_active" = true))));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_users_self_read" ON "public"."admin_users" FOR SELECT USING ("public"."is_active_admin"());



ALTER TABLE "public"."categorization_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channel_integrations_access_by_account" ON "public"."channel_integrations" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."classification_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classification_feedback_access_by_account" ON "public"."classification_feedback" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_access_by_account" ON "public"."clients" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_access_by_account" ON "public"."conversations" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."csat_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "csat_events_access_by_account" ON "public"."csat_events" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "csat_events"."ticket_id") AND ("t"."account_id" = "public"."current_account_id"())))));



ALTER TABLE "public"."decision_work_breaker" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decision_work_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decision_work_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."draft_contact" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."draft_contact_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "draft_contact_audit_select" ON "public"."draft_contact_audit_log" FOR SELECT USING (("account_id" = "public"."current_account_id"()));



CREATE POLICY "draft_contact_insert" ON "public"."draft_contact" FOR INSERT WITH CHECK (("account_id" = "public"."current_account_id"()));



CREATE POLICY "draft_contact_select" ON "public"."draft_contact" FOR SELECT USING (("account_id" = "public"."current_account_id"()));



CREATE POLICY "draft_contact_update" ON "public"."draft_contact" FOR UPDATE USING (("account_id" = "public"."current_account_id"())) WITH CHECK (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."escalation_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escalation_contacts_access_by_account" ON "public"."escalation_contacts" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."escalations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escalations_access_by_account" ON "public"."escalations" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "escalations"."ticket_id") AND ("t"."account_id" = "public"."current_account_id"())))));



ALTER TABLE "public"."kb_articles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kb_articles_access_by_account" ON "public"."kb_articles" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."knowledge_candidate_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_versions_read" ON "public"."knowledge_versions" FOR SELECT USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."llm_calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llm_calls_access_by_account" ON "public"."llm_calls" USING (("account_id" = "public"."current_account_id"()));



CREATE POLICY "members read their account's thresholds" ON "public"."ticket_type_auto_approval" FOR SELECT USING (("account_id" IN ( SELECT "am"."account_id"
   FROM "public"."account_members" "am"
  WHERE (("am"."user_id" = "auth"."uid"()) AND ("am"."status" = 'active'::"text")))));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_access_by_account" ON "public"."messages" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_access_by_recipient" ON "public"."notifications" USING ((("account_id" = "public"."current_account_id"()) AND ("recipient_user_id" = "auth"."uid"())));



ALTER TABLE "public"."oauth_credentials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "oauth_credentials_access_by_account" ON "public"."oauth_credentials" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."operational_learning" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operational_learning_access_by_account" ON "public"."operational_learning" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."response_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "response_templates_access_by_account" ON "public"."response_templates" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."semantic_indexes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "superadmin_audit_log_manage" ON "public"."admin_audit_log" USING (("auth"."uid"() IN ( SELECT "admin_users"."auth_uid"
   FROM "public"."admin_users"
  WHERE ("admin_users"."role" = 'superadmin'::"text"))));



CREATE POLICY "superadmin_manage" ON "public"."admin_users" USING ("public"."is_superadmin"());



ALTER TABLE "public"."support_channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_channels_access_by_account" ON "public"."support_channels" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."support_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_schedules_access_by_account" ON "public"."support_schedules" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."tenant_priority_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_priority_config_access_by_account" ON "public"."tenant_priority_config" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."tenant_sla_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_sla_rules_access_by_account" ON "public"."tenant_sla_rules" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_activity_log_insert_by_account" ON "public"."ticket_activity_log" FOR INSERT WITH CHECK (("account_id" = "public"."current_account_id"()));



CREATE POLICY "ticket_activity_log_select_by_account" ON "public"."ticket_activity_log" FOR SELECT USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_classification_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_classification_history_insert_by_account" ON "public"."ticket_classification_history" FOR INSERT WITH CHECK (("account_id" = "public"."current_account_id"()));



CREATE POLICY "ticket_classification_history_select_by_account" ON "public"."ticket_classification_history" FOR SELECT USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_decision_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_decision_history_read" ON "public"."ticket_decision_history" FOR SELECT USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_followers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_followers_access_by_account" ON "public"."ticket_followers" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_followers"."ticket_id") AND ("t"."account_id" = "public"."current_account_id"())))));



ALTER TABLE "public"."ticket_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_groups_access_by_account" ON "public"."ticket_groups" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_messages_access_by_account" ON "public"."ticket_messages" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_messages"."ticket_id") AND ("t"."account_id" = "public"."current_account_id"())))));



ALTER TABLE "public"."ticket_note_mentions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_note_mentions_access_by_account" ON "public"."ticket_note_mentions" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_notes_access_by_account" ON "public"."ticket_notes" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_priority_sla_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_priority_sla_config_access_by_account" ON "public"."ticket_priority_sla_config" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_priority_sla_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_priority_sla_events_access_by_account" ON "public"."ticket_priority_sla_events" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_proposals_access_by_account" ON "public"."ticket_proposals" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_proposals"."ticket_id") AND ("t"."account_id" = "public"."current_account_id"())))));



ALTER TABLE "public"."ticket_state_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_state_history_insert_by_account" ON "public"."ticket_state_history" FOR INSERT WITH CHECK (("account_id" = "public"."current_account_id"()));



CREATE POLICY "ticket_state_history_select_by_account" ON "public"."ticket_state_history" FOR SELECT USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."ticket_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_tags_access_by_account" ON "public"."ticket_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_tags"."ticket_id") AND ("t"."account_id" = "public"."current_account_id"())))));



ALTER TABLE "public"."ticket_transition_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_transition_rules_select_all" ON "public"."ticket_transition_rules" FOR SELECT USING (true);



ALTER TABLE "public"."ticket_type_auto_approval" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tickets_access_by_account" ON "public"."tickets" USING (("account_id" = "public"."current_account_id"()));



ALTER TABLE "public"."worker_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_runs_select" ON "public"."worker_runs" FOR SELECT USING (("account_id" = "public"."current_account_id"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_assert_draft_access"("p_draft_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_assert_draft_access"("p_draft_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_assert_draft_access"("p_draft_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_assert_draft_access"("p_draft_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."account_effective_seat_limit"("p_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."account_effective_seat_limit"("p_account_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."account_effective_seat_limit"("p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."account_effective_seat_limit"("p_account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_case_revision"() TO "anon";
GRANT ALL ON FUNCTION "public"."advance_case_revision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_case_revision"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_ticket_transition"("p_ticket_id" "uuid", "p_to_state" "text", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_actor_ref" "text", "p_trigger" "text", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_ticket_transition"("p_ticket_id" "uuid", "p_to_state" "text", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_actor_ref" "text", "p_trigger" "text", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_ticket_transition"("p_ticket_id" "uuid", "p_to_state" "text", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_actor_ref" "text", "p_trigger" "text", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_ticket_transition"("p_ticket_id" "uuid", "p_to_state" "text", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_actor_ref" "text", "p_trigger" "text", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_confirm_drafts_by_organization"("p_organization" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_confirm_drafts_by_organization"("p_organization" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_confirm_drafts_by_organization"("p_organization" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_ticket_decision"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_ticket_decision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_ticket_decision"() TO "service_role";



GRANT ALL ON TABLE "public"."decision_work_items" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_decision_work"("p_limit" integer, "p_max_attempts" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_decision_work"("p_limit" integer, "p_max_attempts" integer) TO "service_role";



GRANT ALL ON TABLE "public"."draft_contact" TO "anon";
GRANT ALL ON TABLE "public"."draft_contact" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_contact" TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_draft_contact"("p_draft_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_draft_contact"("p_draft_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_draft_contact"("p_draft_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_account_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_account_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_account_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decision_breaker_delay"("p_level" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."decision_breaker_delay"("p_level" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decision_breaker_delay"("p_level" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."decision_retry_offset"("p_retry" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."decision_retry_offset"("p_retry" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decision_retry_offset"("p_retry" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."edit_draft_contact"("p_draft_id" "uuid", "p_patch" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."edit_draft_contact"("p_draft_id" "uuid", "p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_draft_contact"("p_draft_id" "uuid", "p_patch" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."embedding_dimensions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."embedding_dimensions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_knowledge_candidates"("p_version_id" "uuid", "p_threshold" double precision, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_knowledge_candidates"("p_version_id" "uuid", "p_threshold" double precision, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_message_decision"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_message_decision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_message_decision"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_pending_knowledge"("p_account_id" "uuid", "p_threshold" double precision, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_pending_knowledge"("p_account_id" "uuid", "p_threshold" double precision, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_account_on_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_account_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_account_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_account_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_account_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_account_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_account_id" "uuid", "p_limit" integer, "p_threshold" double precision, "p_status_filter" "text", "p_exclude_same_group" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_account_id" "uuid", "p_limit" integer, "p_threshold" double precision, "p_status_filter" "text", "p_exclude_same_group" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_account_id" "uuid", "p_limit" integer, "p_threshold" double precision, "p_status_filter" "text", "p_exclude_same_group" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_versions" TO "service_role";
GRANT SELECT ON TABLE "public"."knowledge_versions" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."find_workflow_knowledge"("p_account_id" "uuid", "p_query_embedding" "extensions"."vector", "p_ticket_id" "uuid", "p_threshold" double precision, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_workflow_knowledge"("p_account_id" "uuid", "p_query_embedding" "extensions"."vector", "p_ticket_id" "uuid", "p_threshold" double precision, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classification_accuracy"("p_account_id" "uuid", "p_window" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_classification_accuracy"("p_account_id" "uuid", "p_window" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_classification_accuracy"("p_account_id" "uuid", "p_window" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invitation_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invitation_by_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invitation_by_token"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_sidebar_counts"("p_account_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sidebar_counts"("p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sidebar_counts"("p_account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ticket_note_counts"("p_account_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_ticket_note_counts"("p_account_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ticket_note_counts"("p_account_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_tickets_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_tickets_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_tickets_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_account_access"("p_account_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_account_access"("p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_account_access"("p_account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_account_admin"("p_account_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_account_admin"("p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_account_admin"("p_account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_ticket_viewed"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_ticket_viewed"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."provision_account_for_user"("p_user_id" "uuid", "p_account_name" "text", "p_plan_code" "text", "p_seat_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_account_for_user"("p_user_id" "uuid", "p_account_name" "text", "p_plan_code" "text", "p_seat_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."provision_account_for_user"("p_user_id" "uuid", "p_account_name" "text", "p_plan_code" "text", "p_seat_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."provision_account_for_user"("p_user_id" "uuid", "p_account_name" "text", "p_plan_code" "text", "p_seat_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_decision_outcome"("p_ok" boolean, "p_outage_failure" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_decision_outcome"("p_ok" boolean, "p_outage_failure" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_knowledge_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_knowledge_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_knowledge_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_ticket_enrichment"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_revision" bigint, "p_version_id" "uuid", "p_result" "jsonb", "p_useful" boolean, "p_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ticket_enrichment"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_revision" bigint, "p_version_id" "uuid", "p_result" "jsonb", "p_useful" boolean, "p_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_decision_history_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_decision_history_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_decision_history_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_draft_contact"("p_draft_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_draft_contact"("p_draft_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_draft_contact"("p_draft_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_ticket_activity_log_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_ticket_activity_log_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_ticket_activity_log_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_ticket_classification_history_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_ticket_classification_history_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_ticket_classification_history_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_ticket_state_history_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_ticket_state_history_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_ticket_state_history_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_decision_work"("p_id" "uuid", "p_error" "text", "p_retriable" boolean, "p_consume_attempt" boolean, "p_max_attempts" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_decision_work"("p_id" "uuid", "p_error" "text", "p_retriable" boolean, "p_consume_attempt" boolean, "p_max_attempts" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."requeue_failed_decision_work"("p_account_id" "uuid", "p_user_id" "uuid", "p_ids" "uuid"[], "p_contract" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."requeue_failed_decision_work"("p_account_id" "uuid", "p_user_id" "uuid", "p_ids" "uuid"[], "p_contract" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."retrieve_semantic_sources"("p_account_id" "uuid", "p_kind" "text", "p_purpose" "text", "p_query" "extensions"."vector", "p_provider" "text", "p_model" "text", "p_dimensions" integer, "p_ticket_id" "uuid", "p_threshold" double precision, "p_limit" integer, "p_status_filter" "text", "p_exclude_same_group" boolean, "p_knowledge_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retrieve_semantic_sources"("p_account_id" "uuid", "p_kind" "text", "p_purpose" "text", "p_query" "extensions"."vector", "p_provider" "text", "p_model" "text", "p_dimensions" integer, "p_ticket_id" "uuid", "p_threshold" double precision, "p_limit" integer, "p_status_filter" "text", "p_exclude_same_group" boolean, "p_knowledge_kind" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."return_decision_work"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."return_decision_work"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_ticket_enrichment"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid", "p_decision_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_ticket_enrichment"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid", "p_decision_id" "uuid", "p_accept" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_workflow_knowledge"("p_account_id" "uuid", "p_user_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_version_id" "uuid", "p_decision" "text", "p_title" "text", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_workflow_knowledge"("p_account_id" "uuid", "p_user_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_version_id" "uuid", "p_decision" "text", "p_title" "text", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_email_knowledge"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_message_id" "uuid", "p_articles" "jsonb", "p_learnings" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_email_knowledge"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_message_id" "uuid", "p_articles" "jsonb", "p_learnings" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_reply_decision"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid", "p_revision" bigint, "p_proposal" "jsonb", "p_result" "jsonb", "p_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_reply_decision"("p_account_id" "uuid", "p_ticket_id" "uuid", "p_user_id" "uuid", "p_revision" bigint, "p_proposal" "jsonb", "p_result" "jsonb", "p_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."semantic_index_vector"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_query_kind" "text", "p_query_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."semantic_index_vector"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_query_kind" "text", "p_query_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."semantic_revision"("p_source" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."semantic_revision"("p_source" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."semantic_source"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."semantic_source"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."semantic_source_similarity"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_query_kind" "text", "p_query_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."semantic_source_similarity"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_query_kind" "text", "p_query_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."semantic_sources"("p_account_id" "uuid", "p_kind" "text", "p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."semantic_sources"("p_account_id" "uuid", "p_kind" "text", "p_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_default_plan_id_on_accounts"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_default_plan_id_on_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_plan_id_on_accounts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."store_semantic_index"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_revision" "text", "p_preparation" "text", "p_provider" "text", "p_model" "text", "p_dimensions" integer, "p_embedding" "extensions"."vector") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."store_semantic_index"("p_account_id" "uuid", "p_kind" "text", "p_id" "uuid", "p_revision" "text", "p_preparation" "text", "p_provider" "text", "p_model" "text", "p_dimensions" integer, "p_embedding" "extensions"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."unreject_draft_contact"("p_draft_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unreject_draft_contact"("p_draft_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unreject_draft_contact"("p_draft_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_plans_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_plans_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_plans_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."account_invitations" TO "anon";
GRANT ALL ON TABLE "public"."account_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."account_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."account_members" TO "anon";
GRANT ALL ON TABLE "public"."account_members" TO "authenticated";
GRANT ALL ON TABLE "public"."account_members" TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."categorization_feedback" TO "anon";
GRANT ALL ON TABLE "public"."categorization_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."categorization_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."channel_integrations" TO "anon";
GRANT ALL ON TABLE "public"."channel_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."classification_feedback" TO "anon";
GRANT ALL ON TABLE "public"."classification_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."classification_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."csat_events" TO "anon";
GRANT ALL ON TABLE "public"."csat_events" TO "authenticated";
GRANT ALL ON TABLE "public"."csat_events" TO "service_role";



GRANT ALL ON TABLE "public"."latest_knowledge" TO "anon";
GRANT ALL ON TABLE "public"."latest_knowledge" TO "authenticated";
GRANT ALL ON TABLE "public"."latest_knowledge" TO "service_role";



GRANT ALL ON TABLE "public"."current_knowledge" TO "anon";
GRANT ALL ON TABLE "public"."current_knowledge" TO "authenticated";
GRANT ALL ON TABLE "public"."current_knowledge" TO "service_role";



GRANT ALL ON TABLE "public"."decision_work_breaker" TO "service_role";



GRANT ALL ON TABLE "public"."decision_work_outcomes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."decision_work_outcomes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."decision_work_outcomes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."decision_work_outcomes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."draft_contact_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."draft_contact_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_contact_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."escalation_contacts" TO "anon";
GRANT ALL ON TABLE "public"."escalation_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."escalation_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."escalations" TO "anon";
GRANT ALL ON TABLE "public"."escalations" TO "authenticated";
GRANT ALL ON TABLE "public"."escalations" TO "service_role";



GRANT ALL ON TABLE "public"."kb_articles" TO "anon";
GRANT ALL ON TABLE "public"."kb_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."kb_articles" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_candidate_runs" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_decision_history" TO "service_role";
GRANT SELECT ON TABLE "public"."ticket_decision_history" TO "authenticated";



GRANT ALL ON TABLE "public"."ticket_state_history" TO "anon";
GRANT ALL ON TABLE "public"."ticket_state_history" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_state_history" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_enrichment_coverage" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_enrichment_coverage" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_enrichment_coverage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."knowledge_versions_revision_seq" TO "service_role";



GRANT ALL ON TABLE "public"."llm_calls" TO "anon";
GRANT ALL ON TABLE "public"."llm_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_calls" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."oauth_credentials" TO "anon";
GRANT ALL ON TABLE "public"."oauth_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."operational_learning" TO "anon";
GRANT ALL ON TABLE "public"."operational_learning" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_learning" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."response_templates" TO "anon";
GRANT ALL ON TABLE "public"."response_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."response_templates" TO "service_role";



GRANT ALL ON TABLE "public"."semantic_indexes" TO "service_role";



GRANT ALL ON TABLE "public"."support_channels" TO "anon";
GRANT ALL ON TABLE "public"."support_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."support_channels" TO "service_role";



GRANT ALL ON TABLE "public"."support_schedules" TO "anon";
GRANT ALL ON TABLE "public"."support_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."support_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_priority_config" TO "anon";
GRANT ALL ON TABLE "public"."tenant_priority_config" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_priority_config" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_sla_rules" TO "anon";
GRANT ALL ON TABLE "public"."tenant_sla_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_sla_rules" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."ticket_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_activity_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ticket_activity_log_seq_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ticket_activity_log_seq_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ticket_activity_log_seq_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_classification_history" TO "anon";
GRANT ALL ON TABLE "public"."ticket_classification_history" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_classification_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ticket_classification_history_seq_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ticket_classification_history_seq_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ticket_classification_history_seq_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_followers" TO "anon";
GRANT ALL ON TABLE "public"."ticket_followers" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_followers" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_groups" TO "anon";
GRANT ALL ON TABLE "public"."ticket_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_groups" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_messages" TO "anon";
GRANT ALL ON TABLE "public"."ticket_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_notes" TO "anon";
GRANT ALL ON TABLE "public"."ticket_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_notes" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "anon";
GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_lifecycle_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_note_mentions" TO "anon";
GRANT ALL ON TABLE "public"."ticket_note_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_note_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_priority_sla_config" TO "anon";
GRANT ALL ON TABLE "public"."ticket_priority_sla_config" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_priority_sla_config" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_priority_sla_events" TO "anon";
GRANT ALL ON TABLE "public"."ticket_priority_sla_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_priority_sla_events" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_proposals" TO "anon";
GRANT ALL ON TABLE "public"."ticket_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_state_durations" TO "anon";
GRANT ALL ON TABLE "public"."ticket_state_durations" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_state_durations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ticket_state_history_seq_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ticket_state_history_seq_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ticket_state_history_seq_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_tags" TO "anon";
GRANT ALL ON TABLE "public"."ticket_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_tags" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_transition_override_rates" TO "anon";
GRANT ALL ON TABLE "public"."ticket_transition_override_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_transition_override_rates" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_transition_rules" TO "anon";
GRANT ALL ON TABLE "public"."ticket_transition_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_transition_rules" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_type_auto_approval" TO "anon";
GRANT ALL ON TABLE "public"."ticket_type_auto_approval" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_type_auto_approval" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."worker_runs" TO "anon";
GRANT ALL ON TABLE "public"."worker_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_runs" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_metrics" TO "anon";
GRANT ALL ON TABLE "public"."workflow_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_metrics" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







