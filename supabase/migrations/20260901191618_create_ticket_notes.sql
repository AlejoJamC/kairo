-- KAI-191: internal notes are content, not events. `ticket_events` served
-- them with event_type='internal_note', a `body`, and an `is_internal` flag
-- that was always true for that row — two of ticket_events' eight columns
-- existed only for this. ticket_notes gives notes a home shaped like what
-- they are: content an author can still fix or retract, so unlike every
-- other table this migration set introduces, this one is NOT append-only —
-- UPDATE and DELETE stay open (the author corrects a typo, retracts a note).
--
-- This migration creates the table only. No application code writes to or
-- reads from it yet.

CREATE TABLE IF NOT EXISTS "public"."ticket_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."ticket_notes" OWNER TO "postgres";

COMMENT ON TABLE "public"."ticket_notes" IS 'Internal notes on a ticket, visible only to agents. Content, not an event trail: UPDATE/DELETE stay open for the author. account_id is denormalised on purpose so tenant scoping needs no join back to tickets.';

ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");

ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ticket_notes"
    ADD CONSTRAINT "ticket_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX "idx_ticket_notes_ticket" ON "public"."ticket_notes" USING "btree" ("ticket_id", "created_at");

CREATE INDEX "idx_ticket_notes_account_created" ON "public"."ticket_notes" USING "btree" ("account_id", "created_at");

ALTER TABLE "public"."ticket_notes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_notes_access_by_account" ON "public"."ticket_notes" USING (("account_id" = "public"."current_account_id"()));

GRANT ALL ON TABLE "public"."ticket_notes" TO "anon";
GRANT ALL ON TABLE "public"."ticket_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_notes" TO "service_role";

CREATE OR REPLACE TRIGGER "on_ticket_notes_updated" BEFORE UPDATE ON "public"."ticket_notes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
