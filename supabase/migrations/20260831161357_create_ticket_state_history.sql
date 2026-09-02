-- Append-only trail of ticket state transitions.
-- Every field critical to a state transition is a real column, never buried
-- in jsonb. `metadata` exists only for non-critical extras.
--
-- This migration creates the table only. No application code writes to or
-- reads from it yet.

CREATE TABLE IF NOT EXISTS "public"."ticket_state_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "seq" bigint GENERATED ALWAYS AS IDENTITY,
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
    CONSTRAINT "ticket_state_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_state_history_from_state_check" CHECK (("from_state" IS NULL) OR ("from_state" = ANY (ARRAY['open'::"text", 'awaiting_customer'::"text", 'in_progress'::"text", 'resolved'::"text", 'ai_resolved'::"text", 'escalated'::"text", 'reopened'::"text", 'closed'::"text"]))),
    CONSTRAINT "ticket_state_history_to_state_check" CHECK (("to_state" = ANY (ARRAY['open'::"text", 'awaiting_customer'::"text", 'in_progress'::"text", 'resolved'::"text", 'ai_resolved'::"text", 'escalated'::"text", 'reopened'::"text", 'closed'::"text"]))),
    CONSTRAINT "ticket_state_history_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['human'::"text", 'ai'::"text", 'customer'::"text", 'system'::"text"]))),
    CONSTRAINT "ticket_state_history_trigger_check" CHECK (("trigger" = ANY (ARRAY['ticket_created'::"text", 'manual_status_change'::"text", 'agent_reply'::"text", 'agent_reply_resolve'::"text", 'customer_reply'::"text", 'escalate_action'::"text", 'sla_escalation'::"text", 'external_domain_closure'::"text"]))),
    CONSTRAINT "ticket_state_history_account_id_idempotency_key_key" UNIQUE ("account_id", "idempotency_key")
);

ALTER TABLE "public"."ticket_state_history" OWNER TO "postgres";

COMMENT ON TABLE "public"."ticket_state_history" IS 'Append-only trail of ticket state transitions. account_id is denormalised on purpose so tenant scoping and metrics need no join back to tickets.';

ALTER TABLE ONLY "public"."ticket_state_history"
    ADD CONSTRAINT "ticket_state_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");

ALTER TABLE ONLY "public"."ticket_state_history"
    ADD CONSTRAINT "ticket_state_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ticket_state_history"
    ADD CONSTRAINT "ticket_state_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX "idx_ticket_state_history_ticket_seq" ON "public"."ticket_state_history" USING "btree" ("ticket_id", "seq");

CREATE INDEX "idx_ticket_state_history_account_occurred" ON "public"."ticket_state_history" USING "btree" ("account_id", "occurred_at");

ALTER TABLE "public"."ticket_state_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_state_history_select_by_account" ON "public"."ticket_state_history" FOR SELECT USING (("account_id" = "public"."current_account_id"()));

CREATE POLICY "ticket_state_history_insert_by_account" ON "public"."ticket_state_history" FOR INSERT WITH CHECK (("account_id" = "public"."current_account_id"()));

GRANT ALL ON TABLE "public"."ticket_state_history" TO "anon";
GRANT ALL ON TABLE "public"."ticket_state_history" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_state_history" TO "service_role";
