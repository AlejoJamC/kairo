-- KAI-191: the six classification event_types in ticket_events recorded a
-- judgement about a ticket's attributes (category/priority/sentiment/
-- emotion/ticket_type), not a lifecycle movement — a different shape than
-- either ticket_state_history (a status trail) or ticket_activity_log
-- (single-fact, no body). ticket_classification_history gives that judgement
-- its own append-only home: one row per (ticket, dimension) change, so a
-- classification pass touching four attributes leaves four rows, not one
-- row with four fields buried in metadata.
--
-- Checked against ticket_proposals: it already carries the AI-proposal side
-- (proposed_category/priority/type/sentiment, confidence_score,
-- model_version, status, reviewed_by/at) for the staged, per-conversation
-- suggestion. This table is the applied-decision ledger instead — every
-- actor's classification decision on a ticket, human corrections included,
-- which ticket_proposals was never shaped to hold (it has no `dimension`,
-- no `from_value`/`to_value`, and no row for a human correction at all).
--
-- This migration creates the table only. No application code writes to or
-- reads from it yet.

CREATE TABLE IF NOT EXISTS "public"."ticket_classification_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "seq" bigint GENERATED ALWAYS AS IDENTITY,
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
    CONSTRAINT "ticket_classification_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_classification_history_dimension_check" CHECK (("dimension" = ANY (ARRAY['category'::"text", 'priority'::"text", 'sentiment'::"text", 'emotion'::"text", 'ticket_type'::"text"]))),
    CONSTRAINT "ticket_classification_history_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['human'::"text", 'ai'::"text", 'customer'::"text", 'system'::"text"]))),
    CONSTRAINT "ticket_classification_history_account_id_idempotency_key_key" UNIQUE ("account_id", "idempotency_key")
);

ALTER TABLE "public"."ticket_classification_history" OWNER TO "postgres";

COMMENT ON TABLE "public"."ticket_classification_history" IS 'Append-only ledger of classification decisions on a ticket''s attributes (category/priority/sentiment/emotion/ticket_type) — one row per (ticket, dimension) change, human corrections included. account_id is denormalised on purpose so tenant scoping and metrics need no join back to tickets.';

ALTER TABLE ONLY "public"."ticket_classification_history"
    ADD CONSTRAINT "ticket_classification_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");

ALTER TABLE ONLY "public"."ticket_classification_history"
    ADD CONSTRAINT "ticket_classification_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ticket_classification_history"
    ADD CONSTRAINT "ticket_classification_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX "idx_ticket_classification_history_ticket_seq" ON "public"."ticket_classification_history" USING "btree" ("ticket_id", "seq");

CREATE INDEX "idx_ticket_classification_history_account_occurred" ON "public"."ticket_classification_history" USING "btree" ("account_id", "occurred_at");

ALTER TABLE "public"."ticket_classification_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_classification_history_select_by_account" ON "public"."ticket_classification_history" FOR SELECT USING (("account_id" = "public"."current_account_id"()));

CREATE POLICY "ticket_classification_history_insert_by_account" ON "public"."ticket_classification_history" FOR INSERT WITH CHECK (("account_id" = "public"."current_account_id"()));

GRANT ALL ON TABLE "public"."ticket_classification_history" TO "anon";
GRANT ALL ON TABLE "public"."ticket_classification_history" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_classification_history" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reject_ticket_classification_history_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'ticket_classification_history is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

ALTER FUNCTION "public"."reject_ticket_classification_history_mutation"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."reject_ticket_classification_history_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_ticket_classification_history_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_ticket_classification_history_mutation"() TO "service_role";

CREATE OR REPLACE TRIGGER "ticket_classification_history_append_only" BEFORE DELETE OR UPDATE ON "public"."ticket_classification_history" FOR EACH ROW EXECUTE FUNCTION "public"."reject_ticket_classification_history_mutation"();
