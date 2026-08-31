-- Append-only log of ticket facts that share one exact shape: this happened
-- to this ticket, at T, by A, for reason B, with no body. State transitions
-- live in ticket_state_history, messages in messages, internal notes and
-- classification elsewhere. This table is deliberately not named `events`:
-- it is not a source of state.
--
-- This migration creates the table only. No application code writes to or
-- reads from it yet.

CREATE TABLE IF NOT EXISTS "public"."ticket_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "seq" bigint GENERATED ALWAYS AS IDENTITY,
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
    CONSTRAINT "ticket_activity_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_activity_log_domain_check" CHECK (("domain" = ANY (ARRAY['tickets'::"text", 'deduplication'::"text", 'grouping'::"text", 'ans'::"text", 'escalation'::"text"]))),
    CONSTRAINT "ticket_activity_log_event_type_check" CHECK (("event_type" = ANY (ARRAY['assignment'::"text", 'merge'::"text", 'merged_into'::"text", 'grouped'::"text", 'sla_breach'::"text", 'escalated'::"text"]))),
    CONSTRAINT "ticket_activity_log_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['human'::"text", 'ai'::"text", 'customer'::"text", 'system'::"text"]))),
    CONSTRAINT "ticket_activity_log_account_id_idempotency_key_key" UNIQUE ("account_id", "idempotency_key")
);

ALTER TABLE "public"."ticket_activity_log" OWNER TO "postgres";

COMMENT ON TABLE "public"."ticket_activity_log" IS 'Append-only log of non-state ticket facts (assignment, merge, grouping, SLA breach, escalation) shared across domains. account_id is denormalised on purpose so tenant scoping and metrics need no join back to tickets.';

ALTER TABLE ONLY "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");

ALTER TABLE ONLY "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ticket_activity_log"
    ADD CONSTRAINT "ticket_activity_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX "idx_ticket_activity_log_ticket_seq" ON "public"."ticket_activity_log" USING "btree" ("ticket_id", "seq");

CREATE INDEX "idx_ticket_activity_log_account_occurred" ON "public"."ticket_activity_log" USING "btree" ("account_id", "occurred_at");

ALTER TABLE "public"."ticket_activity_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_activity_log_select_by_account" ON "public"."ticket_activity_log" FOR SELECT USING (("account_id" = "public"."current_account_id"()));

CREATE POLICY "ticket_activity_log_insert_by_account" ON "public"."ticket_activity_log" FOR INSERT WITH CHECK (("account_id" = "public"."current_account_id"()));

GRANT ALL ON TABLE "public"."ticket_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."ticket_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_activity_log" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reject_ticket_activity_log_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'ticket_activity_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

ALTER FUNCTION "public"."reject_ticket_activity_log_mutation"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."reject_ticket_activity_log_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_ticket_activity_log_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_ticket_activity_log_mutation"() TO "service_role";

CREATE OR REPLACE TRIGGER "ticket_activity_log_append_only" BEFORE DELETE OR UPDATE ON "public"."ticket_activity_log" FOR EACH ROW EXECUTE FUNCTION "public"."reject_ticket_activity_log_mutation"();
