


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



CREATE OR REPLACE FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_user_id" "uuid", "p_limit" integer DEFAULT 3) RETURNS TABLE("article_id" "uuid", "title" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    id AS article_id,
    title,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM kb_articles
  WHERE user_id = p_user_id
    AND is_published = true
    AND embedding IS NOT NULL
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_user_id" "uuid", "p_limit" integer DEFAULT 5, "p_threshold" double precision DEFAULT 0.80) RETURNS TABLE("ticket_id" "uuid", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    t.id AS ticket_id,
    1 - (t.embedding <=> source.embedding) AS similarity
  FROM tickets t,
    (SELECT embedding FROM tickets WHERE id = p_ticket_id) AS source
  WHERE t.user_id = p_user_id
    AND t.id != p_ticket_id
    AND t.embedding IS NOT NULL
    AND source.embedding IS NOT NULL
    AND 1 - (t.embedding <=> source.embedding) > p_threshold
  ORDER BY t.embedding <=> source.embedding
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_user_id" "uuid", "p_limit" integer, "p_threshold" double precision) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."recompute_category_confidence_thresholds"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.category_confidence_thresholds (
    category,
    min_confidence,
    min_sample_size,
    current_accuracy,
    current_sample_count,
    auto_approval_enabled,
    last_evaluated_at
  )
  SELECT
    cf.predicted_category                                                  AS category,
    0.85                                                                   AS min_confidence,
    50                                                                     AS min_sample_size,
    COUNT(*) FILTER (WHERE cf.outcome IN ('confirmed', 'auto'))::float
      / NULLIF(COUNT(*), 0)                                                AS current_accuracy,
    COUNT(*)                                                               AS current_sample_count,
    false                                                                  AS auto_approval_enabled,
    now()                                                                  AS last_evaluated_at
  FROM public.categorization_feedback cf
  WHERE cf.predicted_category IS NOT NULL
  GROUP BY cf.predicted_category
  ON CONFLICT (category) DO UPDATE SET
    current_accuracy      = EXCLUDED.current_accuracy,
    current_sample_count  = EXCLUDED.current_sample_count,
    -- flip auto_approval_enabled using the stored thresholds, not hardcoded values
    auto_approval_enabled = (
      EXCLUDED.current_sample_count  >= category_confidence_thresholds.min_sample_size
      AND EXCLUDED.current_accuracy  >= category_confidence_thresholds.min_confidence
    ),
    last_evaluated_at     = EXCLUDED.last_evaluated_at,
    updated_at            = now();
END;
$$;


ALTER FUNCTION "public"."recompute_category_confidence_thresholds"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


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


CREATE TABLE IF NOT EXISTS "public"."category_confidence_thresholds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "min_confidence" double precision DEFAULT 0.85 NOT NULL,
    "min_sample_size" integer DEFAULT 50 NOT NULL,
    "current_accuracy" double precision,
    "current_sample_count" integer DEFAULT 0 NOT NULL,
    "auto_approval_enabled" boolean DEFAULT false NOT NULL,
    "last_evaluated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."category_confidence_thresholds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "external_account_id" "text" NOT NULL,
    "display_name" "text",
    "credentials_encrypted" "jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."channel_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
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
    CONSTRAINT "clients_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['Enterprise'::"text", 'Pro'::"text", 'Starter'::"text"]))),
    CONSTRAINT "clients_sla_level_check" CHECK (("sla_level" = ANY (ARRAY['Critical'::"text", 'High'::"text", 'Standard'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel_integration_id" "uuid" NOT NULL,
    "customer_external_id" "text" NOT NULL,
    "customer_display_name" "text",
    "customer_avatar_url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_thread_id" "text"
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."csat_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "score" integer,
    "comment" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "csat_events_score_check" CHECK ((("score" >= 1) AND ("score" <= 5)))
);


ALTER TABLE "public"."csat_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalation_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "channel" "text" DEFAULT 'sms'::"text" NOT NULL,
    "escalation_level" integer DEFAULT 2 NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "escalation_contacts_channel_check" CHECK (("channel" = ANY (ARRAY['sms'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."escalation_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
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


CREATE TABLE IF NOT EXISTS "public"."gmail_accounts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gmail_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."gmail_accounts" IS 'Gmail OAuth tokens for connected accounts';



CREATE TABLE IF NOT EXISTS "public"."kb_articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "extensions"."vector"(512),
    "tags" "text"[],
    "is_published" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kb_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."llm_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
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
    CONSTRAINT "llm_calls_confidence_check" CHECK ((("confidence_score" IS NULL) OR (("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (1)::numeric)))),
    CONSTRAINT "llm_calls_outcome_check" CHECK ((("outcome" IS NULL) OR ("outcome" = ANY (ARRAY['accepted'::"text", 'edited'::"text", 'rejected'::"text", 'ignored'::"text", 'auto_applied'::"text"]))))
);


ALTER TABLE "public"."llm_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "channel_integration_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
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
    CONSTRAINT "messages_classification_status_check" CHECK ((("classification_status" IS NULL) OR ("classification_status" = ANY (ARRAY['pending'::"text", 'classified'::"text", 'skipped'::"text", 'failed'::"text"]))))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."messages"."processing_batch" IS 'onboarding = initial 90-day backfill, incremental = recurring sync';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "company_name" "text",
    "gmail_connected" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Extended user profile data for Kairo users';



CREATE TABLE IF NOT EXISTS "public"."response_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text",
    "locale" "text" DEFAULT 'es'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."response_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "timezone" "text" DEFAULT 'America/Bogota'::"text" NOT NULL,
    CONSTRAINT "support_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."support_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_priority_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weight_type" numeric(3,2) DEFAULT 0.30 NOT NULL,
    "weight_plan" numeric(3,2) DEFAULT 0.35 NOT NULL,
    "weight_emotion" numeric(3,2) DEFAULT 0.20 NOT NULL,
    "weight_age" numeric(3,2) DEFAULT 0.15 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_weights_sum" CHECK (("abs"((((("weight_type" + "weight_plan") + "weight_emotion") + "weight_age") - 1.00)) < 0.01))
);


ALTER TABLE "public"."tenant_priority_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_sla_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ticket_type" "text" NOT NULL,
    "plan_tier" "text" NOT NULL,
    "response_hours" integer NOT NULL,
    "resolution_hours" integer,
    CONSTRAINT "tenant_sla_rules_plan_tier_check" CHECK (("plan_tier" = ANY (ARRAY['enterprise'::"text", 'pro'::"text", 'starter'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."tenant_sla_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "event_type" "text" NOT NULL,
    "body" "text",
    "is_internal" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ticket_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['reply_sent'::"text", 'internal_note'::"text", 'status_change'::"text", 'assignment'::"text", 'merge'::"text", 'ai_classified'::"text", 'human_classified'::"text", 'ai_proposal'::"text", 'ai_confirmed'::"text", 'ai_rejected'::"text", 'sla_breach'::"text", 'escalated'::"text", 'grouped'::"text"])))
);


ALTER TABLE "public"."ticket_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_followers" (
    "ticket_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_followers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_messages" (
    "ticket_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "is_origin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_messages" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."ticket_tags" (
    "ticket_id" "uuid" NOT NULL,
    "tag" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
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
    "embedding" "extensions"."vector"(512),
    "embedding_updated_at" timestamp with time zone,
    CONSTRAINT "chk_category" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['technical'::"text", 'billing'::"text", 'account'::"text", 'general'::"text", 'not_applicable'::"text"])))),
    CONSTRAINT "chk_emotion" CHECK ((("emotion" IS NULL) OR ("emotion" = ANY (ARRAY['aggressive'::"text", 'frustrated'::"text", 'neutral'::"text", 'positive'::"text"])))),
    CONSTRAINT "chk_priority" CHECK ((("priority" IS NULL) OR ("priority" = ANY (ARRAY['P1'::"text", 'P2'::"text", 'P3'::"text"])))),
    CONSTRAINT "chk_priority_score" CHECK ((("priority_score" IS NULL) OR (("priority_score" >= 0.000) AND ("priority_score" <= 1.000)))),
    CONSTRAINT "chk_sentiment" CHECK ((("sentiment" IS NULL) OR ("sentiment" = ANY (ARRAY['aggressive'::"text", 'frustrated'::"text", 'neutral'::"text", 'positive'::"text"])))),
    CONSTRAINT "chk_ticket_type" CHECK ((("ticket_type" IS NULL) OR ("ticket_type" = ANY (ARRAY['support'::"text", 'prospect'::"text", 'spam'::"text", 'internal'::"text", 'other'::"text"]))))
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


ALTER TABLE "public"."tickets" ALTER COLUMN "ticket_number" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tickets_ticket_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



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



ALTER TABLE ONLY "public"."category_confidence_thresholds"
    ADD CONSTRAINT "category_confidence_thresholds_category_key" UNIQUE ("category");



ALTER TABLE ONLY "public"."category_confidence_thresholds"
    ADD CONSTRAINT "category_confidence_thresholds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_integrations"
    ADD CONSTRAINT "channel_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_integrations"
    ADD CONSTRAINT "channel_integrations_user_provider_account_key" UNIQUE ("user_id", "provider", "external_account_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_internal_id_key" UNIQUE ("user_id", "internal_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_integration_customer_key" UNIQUE ("channel_integration_id", "customer_external_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."csat_events"
    ADD CONSTRAINT "csat_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_contacts"
    ADD CONSTRAINT "escalation_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalations"
    ADD CONSTRAINT "escalations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gmail_accounts"
    ADD CONSTRAINT "gmail_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gmail_accounts"
    ADD CONSTRAINT "gmail_accounts_user_id_email_key" UNIQUE ("user_id", "email");



ALTER TABLE ONLY "public"."kb_articles"
    ADD CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."llm_calls"
    ADD CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_integration_external_id_key" UNIQUE ("channel_integration_id", "external_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_schedules"
    ADD CONSTRAINT "support_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_schedules"
    ADD CONSTRAINT "support_schedules_user_id_day_of_week_key" UNIQUE ("user_id", "day_of_week");



ALTER TABLE ONLY "public"."tenant_priority_config"
    ADD CONSTRAINT "tenant_priority_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_priority_config"
    ADD CONSTRAINT "tenant_priority_config_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."tenant_sla_rules"
    ADD CONSTRAINT "tenant_sla_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_sla_rules"
    ADD CONSTRAINT "tenant_sla_rules_user_id_ticket_type_plan_tier_key" UNIQUE ("user_id", "ticket_type", "plan_tier");



ALTER TABLE ONLY "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_followers"
    ADD CONSTRAINT "ticket_followers_pkey" PRIMARY KEY ("ticket_id", "user_id");



ALTER TABLE ONLY "public"."ticket_groups"
    ADD CONSTRAINT "ticket_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("ticket_id", "message_id");



ALTER TABLE ONLY "public"."ticket_proposals"
    ADD CONSTRAINT "ticket_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_tags"
    ADD CONSTRAINT "ticket_tags_pkey" PRIMARY KEY ("ticket_id", "tag");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_ticket_number_key" UNIQUE ("ticket_number");



CREATE INDEX "idx_admin_audit_log_admin_user_id" ON "public"."admin_audit_log" USING "btree" ("admin_user_id");



CREATE INDEX "idx_admin_audit_log_target" ON "public"."admin_audit_log" USING "btree" ("target_table", "target_id");



CREATE INDEX "idx_admin_users_auth_uid" ON "public"."admin_users" USING "btree" ("auth_uid");



CREATE INDEX "idx_categorization_feedback_created_at" ON "public"."categorization_feedback" USING "btree" ("created_at");



CREATE INDEX "idx_categorization_feedback_is_correction" ON "public"."categorization_feedback" USING "btree" ("is_correction");



CREATE INDEX "idx_categorization_feedback_model_version" ON "public"."categorization_feedback" USING "btree" ("model_version");



CREATE INDEX "idx_categorization_feedback_outcome" ON "public"."categorization_feedback" USING "btree" ("outcome");



CREATE INDEX "idx_categorization_feedback_predicted_category" ON "public"."categorization_feedback" USING "btree" ("predicted_category");



CREATE INDEX "idx_channel_integrations_provider" ON "public"."channel_integrations" USING "btree" ("provider");



CREATE INDEX "idx_channel_integrations_user_id" ON "public"."channel_integrations" USING "btree" ("user_id");



CREATE INDEX "idx_clients_name" ON "public"."clients" USING "btree" ("user_id", "name");



CREATE INDEX "idx_clients_user_id" ON "public"."clients" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_channel_integration_id" ON "public"."conversations" USING "btree" ("channel_integration_id");



CREATE INDEX "idx_conversations_customer_external_id" ON "public"."conversations" USING "btree" ("customer_external_id");



CREATE INDEX "idx_conversations_external_thread_id" ON "public"."conversations" USING "btree" ("external_thread_id") WHERE ("external_thread_id" IS NOT NULL);



CREATE INDEX "idx_conversations_user_id" ON "public"."conversations" USING "btree" ("user_id");



CREATE INDEX "idx_gmail_accounts_user_id" ON "public"."gmail_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_kb_articles_embedding" ON "public"."kb_articles" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "idx_llm_calls_created_at" ON "public"."llm_calls" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_llm_calls_feature" ON "public"."llm_calls" USING "btree" ("feature");



CREATE INDEX "idx_llm_calls_model" ON "public"."llm_calls" USING "btree" ("model");



CREATE INDEX "idx_llm_calls_outcome" ON "public"."llm_calls" USING "btree" ("outcome") WHERE ("outcome" IS NOT NULL);



CREATE INDEX "idx_llm_calls_prompt_version" ON "public"."llm_calls" USING "btree" ("feature", "prompt_version");



CREATE INDEX "idx_llm_calls_ticket_id" ON "public"."llm_calls" USING "btree" ("ticket_id");



CREATE INDEX "idx_messages_classification_status" ON "public"."messages" USING "btree" ("classification_status");



CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_direction" ON "public"."messages" USING "btree" ("direction");



CREATE INDEX "idx_messages_processing_batch" ON "public"."messages" USING "btree" ("processing_batch");



CREATE INDEX "idx_messages_processing_tier" ON "public"."messages" USING "btree" ("processing_tier");



CREATE INDEX "idx_messages_received_at" ON "public"."messages" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_messages_thread_external_id" ON "public"."messages" USING "btree" ("thread_external_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_response_templates_locale" ON "public"."response_templates" USING "btree" ("user_id", "locale") WHERE ("is_active" = true);



CREATE INDEX "idx_response_templates_user_id" ON "public"."response_templates" USING "btree" ("user_id") WHERE ("is_active" = true);



CREATE INDEX "idx_ticket_events_author_id" ON "public"."ticket_events" USING "btree" ("author_id");



CREATE INDEX "idx_ticket_events_event_type" ON "public"."ticket_events" USING "btree" ("event_type");



CREATE INDEX "idx_ticket_events_ticket_id" ON "public"."ticket_events" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_messages_message_id" ON "public"."ticket_messages" USING "btree" ("message_id");



CREATE INDEX "idx_ticket_proposals_confidence_score" ON "public"."ticket_proposals" USING "btree" ("confidence_score");



CREATE INDEX "idx_ticket_proposals_conversation_id" ON "public"."ticket_proposals" USING "btree" ("conversation_id");



CREATE INDEX "idx_ticket_proposals_model_version" ON "public"."ticket_proposals" USING "btree" ("model_version");



CREATE INDEX "idx_ticket_proposals_status" ON "public"."ticket_proposals" USING "btree" ("status");



CREATE INDEX "idx_ticket_tags_tag" ON "public"."ticket_tags" USING "btree" ("tag");



CREATE INDEX "idx_tickets_assigned_to" ON "public"."tickets" USING "btree" ("assigned_to");



CREATE INDEX "idx_tickets_client_id" ON "public"."tickets" USING "btree" ("client_id");



CREATE INDEX "idx_tickets_conversation_id" ON "public"."tickets" USING "btree" ("conversation_id");



CREATE INDEX "idx_tickets_embedding" ON "public"."tickets" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "idx_tickets_gmail_message_id" ON "public"."tickets" USING "btree" ("gmail_message_id");



CREATE INDEX "idx_tickets_priority_score" ON "public"."tickets" USING "btree" ("user_id", "priority_score" DESC NULLS LAST);



CREATE INDEX "idx_tickets_received_at" ON "public"."tickets" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_tickets_sla_due_at" ON "public"."tickets" USING "btree" ("sla_due_at");



CREATE INDEX "idx_tickets_status" ON "public"."tickets" USING "btree" ("status");



CREATE INDEX "idx_tickets_ticket_number" ON "public"."tickets" USING "btree" ("ticket_number");



CREATE INDEX "idx_tickets_user_id" ON "public"."tickets" USING "btree" ("user_id");



CREATE INDEX "tickets_group_id_idx" ON "public"."tickets" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "on_category_confidence_thresholds_updated" BEFORE UPDATE ON "public"."category_confidence_thresholds" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_channel_integrations_updated" BEFORE UPDATE ON "public"."channel_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_clients_updated" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_conversations_updated" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_gmail_accounts_updated" BEFORE UPDATE ON "public"."gmail_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_response_templates_updated" BEFORE UPDATE ON "public"."response_templates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_tickets_updated" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id");



ALTER TABLE ONLY "public"."categorization_feedback"
    ADD CONSTRAINT "categorization_feedback_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."ticket_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorization_feedback"
    ADD CONSTRAINT "categorization_feedback_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."channel_integrations"
    ADD CONSTRAINT "channel_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_channel_integration_id_fkey" FOREIGN KEY ("channel_integration_id") REFERENCES "public"."channel_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."csat_events"
    ADD CONSTRAINT "csat_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."csat_events"
    ADD CONSTRAINT "csat_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."escalation_contacts"
    ADD CONSTRAINT "escalation_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escalations"
    ADD CONSTRAINT "escalations_escalated_by_fkey" FOREIGN KEY ("escalated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."escalations"
    ADD CONSTRAINT "escalations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id");



ALTER TABLE ONLY "public"."escalations"
    ADD CONSTRAINT "escalations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gmail_accounts"
    ADD CONSTRAINT "gmail_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kb_articles"
    ADD CONSTRAINT "kb_articles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."llm_calls"
    ADD CONSTRAINT "llm_calls_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."llm_calls"
    ADD CONSTRAINT "llm_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_channel_integration_id_fkey" FOREIGN KEY ("channel_integration_id") REFERENCES "public"."channel_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_schedules"
    ADD CONSTRAINT "support_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_priority_config"
    ADD CONSTRAINT "tenant_priority_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_sla_rules"
    ADD CONSTRAINT "tenant_sla_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_followers"
    ADD CONSTRAINT "ticket_followers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_followers"
    ADD CONSTRAINT "ticket_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_groups"
    ADD CONSTRAINT "ticket_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_proposals"
    ADD CONSTRAINT "ticket_proposals_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_proposals"
    ADD CONSTRAINT "ticket_proposals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_proposals"
    ADD CONSTRAINT "ticket_proposals_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_tags"
    ADD CONSTRAINT "ticket_tags_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



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
    ADD CONSTRAINT "tickets_parent_ticket_id_fkey" FOREIGN KEY ("parent_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can read categorization_feedback" ON "public"."categorization_feedback" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read category_confidence_thresholds" ON "public"."category_confidence_thresholds" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Users CRUD own csat_events" ON "public"."csat_events" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users CRUD own escalation_contacts" ON "public"."escalation_contacts" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users CRUD own escalations" ON "public"."escalations" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users CRUD own kb_articles" ON "public"."kb_articles" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users CRUD own support_schedules" ON "public"."support_schedules" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own channel integrations" ON "public"."channel_integrations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own follows" ON "public"."ticket_followers" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own gmail accounts" ON "public"."gmail_accounts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own templates" ON "public"."response_templates" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own ticket tags" ON "public"."ticket_tags" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_tags"."ticket_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own tickets" ON "public"."tickets" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own channel integrations" ON "public"."channel_integrations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own conversations" ON "public"."conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own follows" ON "public"."ticket_followers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own gmail accounts" ON "public"."gmail_accounts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own messages" ON "public"."messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own templates" ON "public"."response_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own ticket events" ON "public"."ticket_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_events"."ticket_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own ticket proposals" ON "public"."ticket_proposals" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "ticket_proposals"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own ticket tags" ON "public"."ticket_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_tags"."ticket_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own ticket_messages" ON "public"."ticket_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_messages"."ticket_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own tickets" ON "public"."tickets" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own channel integrations" ON "public"."channel_integrations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own conversations" ON "public"."conversations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own gmail accounts" ON "public"."gmail_accounts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own templates" ON "public"."response_templates" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own ticket proposals" ON "public"."ticket_proposals" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "ticket_proposals"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own tickets" ON "public"."tickets" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own channel integrations" ON "public"."channel_integrations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own conversations" ON "public"."conversations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own follows" ON "public"."ticket_followers" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own gmail accounts" ON "public"."gmail_accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own llm calls" ON "public"."llm_calls" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own messages" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own templates" ON "public"."response_templates" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own ticket events" ON "public"."ticket_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_events"."ticket_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own ticket proposals" ON "public"."ticket_proposals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "ticket_proposals"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own ticket tags" ON "public"."ticket_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_tags"."ticket_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own ticket_messages" ON "public"."ticket_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_messages"."ticket_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own tickets" ON "public"."tickets" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_audit_log_read" ON "public"."admin_audit_log" FOR SELECT USING (("auth"."uid"() IN ( SELECT "admin_users"."auth_uid"
   FROM "public"."admin_users"
  WHERE ("admin_users"."is_active" = true))));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_users_self_read" ON "public"."admin_users" FOR SELECT USING ("public"."is_active_admin"());



ALTER TABLE "public"."categorization_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_confidence_thresholds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_delete_own" ON "public"."clients" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "clients_insert_own" ON "public"."clients" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "clients_select_own" ON "public"."clients" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "clients_update_own" ON "public"."clients" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."csat_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escalation_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escalations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gmail_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kb_articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."llm_calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."response_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "superadmin_audit_log_manage" ON "public"."admin_audit_log" USING (("auth"."uid"() IN ( SELECT "admin_users"."auth_uid"
   FROM "public"."admin_users"
  WHERE ("admin_users"."role" = 'superadmin'::"text"))));



CREATE POLICY "superadmin_manage" ON "public"."admin_users" USING ("public"."is_superadmin"());



ALTER TABLE "public"."support_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_owns_groups" ON "public"."ticket_groups" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."tenant_priority_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_priority_config_owner" ON "public"."tenant_priority_config" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."tenant_sla_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_sla_rules_owner" ON "public"."tenant_sla_rules" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."ticket_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_followers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_relevant_kb"("p_query_embedding" "extensions"."vector", "p_user_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_user_id" "uuid", "p_limit" integer, "p_threshold" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_user_id" "uuid", "p_limit" integer, "p_threshold" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_similar_tickets"("p_ticket_id" "uuid", "p_user_id" "uuid", "p_limit" integer, "p_threshold" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_category_confidence_thresholds"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_category_confidence_thresholds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_category_confidence_thresholds"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."categorization_feedback" TO "anon";
GRANT ALL ON TABLE "public"."categorization_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."categorization_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."category_confidence_thresholds" TO "anon";
GRANT ALL ON TABLE "public"."category_confidence_thresholds" TO "authenticated";
GRANT ALL ON TABLE "public"."category_confidence_thresholds" TO "service_role";



GRANT ALL ON TABLE "public"."channel_integrations" TO "anon";
GRANT ALL ON TABLE "public"."channel_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."csat_events" TO "anon";
GRANT ALL ON TABLE "public"."csat_events" TO "authenticated";
GRANT ALL ON TABLE "public"."csat_events" TO "service_role";



GRANT ALL ON TABLE "public"."escalation_contacts" TO "anon";
GRANT ALL ON TABLE "public"."escalation_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."escalation_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."escalations" TO "anon";
GRANT ALL ON TABLE "public"."escalations" TO "authenticated";
GRANT ALL ON TABLE "public"."escalations" TO "service_role";



GRANT ALL ON TABLE "public"."gmail_accounts" TO "anon";
GRANT ALL ON TABLE "public"."gmail_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."gmail_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."kb_articles" TO "anon";
GRANT ALL ON TABLE "public"."kb_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."kb_articles" TO "service_role";



GRANT ALL ON TABLE "public"."llm_calls" TO "anon";
GRANT ALL ON TABLE "public"."llm_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_calls" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."response_templates" TO "anon";
GRANT ALL ON TABLE "public"."response_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."response_templates" TO "service_role";



GRANT ALL ON TABLE "public"."support_schedules" TO "anon";
GRANT ALL ON TABLE "public"."support_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."support_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_priority_config" TO "anon";
GRANT ALL ON TABLE "public"."tenant_priority_config" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_priority_config" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_sla_rules" TO "anon";
GRANT ALL ON TABLE "public"."tenant_sla_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_sla_rules" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_events" TO "anon";
GRANT ALL ON TABLE "public"."ticket_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_events" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_followers" TO "anon";
GRANT ALL ON TABLE "public"."ticket_followers" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_followers" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_groups" TO "anon";
GRANT ALL ON TABLE "public"."ticket_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_groups" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_messages" TO "anon";
GRANT ALL ON TABLE "public"."ticket_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_proposals" TO "anon";
GRANT ALL ON TABLE "public"."ticket_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_tags" TO "anon";
GRANT ALL ON TABLE "public"."ticket_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_tags" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "service_role";



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







