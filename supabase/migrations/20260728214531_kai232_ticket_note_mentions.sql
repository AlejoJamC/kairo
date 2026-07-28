-- KAI-232: mentions on internal notes + mention notifications (ADR-025)
--
-- Internal notes stay in `ticket_events` (event_type='internal_note'). This
-- migration only adds the mention layer on top of them:
--   1. `ticket_note_mentions` — one row per (note, mentioned user), with the
--      notified/read timestamps KAI-232 needs for traceability.
--   2. `notifications.ticket_event_id` — note-level deep-link target so a
--      mention notification can scroll the thread to the exact note.
--   3. Recipient-scoped RLS on `notifications` (ADR-025 §5): the previous
--      account-only policy let any teammate read anyone's notifications
--      through the anon-key client, and mention notifications embed note
--      excerpts.

-- ---------------------------------------------------------------------------
-- 1. ticket_note_mentions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."ticket_note_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "ticket_event_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "notified_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ticket_note_mentions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_note_mentions_event_user_key" UNIQUE ("ticket_event_id", "mentioned_user_id")
);

ALTER TABLE "public"."ticket_note_mentions" OWNER TO "postgres";

ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_ticket_event_id_fkey" FOREIGN KEY ("ticket_event_id") REFERENCES "public"."ticket_events"("id") ON DELETE CASCADE;

-- Membership semantics (ADR-022 Level 2): the row *is* the user<->note
-- relationship, so it disappears with the user; the note itself survives.
ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_ticket_note_mentions_user"
    ON "public"."ticket_note_mentions" USING "btree" ("mentioned_user_id", "read_at");

CREATE INDEX IF NOT EXISTS "idx_ticket_note_mentions_ticket"
    ON "public"."ticket_note_mentions" USING "btree" ("ticket_id");

ALTER TABLE "public"."ticket_note_mentions" ENABLE ROW LEVEL SECURITY;

-- Account-scoped: every team member may read the notes, so they may read the
-- mentions on them (ADR-022 — direct column check, no join).
CREATE POLICY "ticket_note_mentions_access_by_account" ON "public"."ticket_note_mentions"
    USING (("account_id" = "public"."current_account_id"()));

GRANT ALL ON TABLE "public"."ticket_note_mentions" TO "anon";
GRANT ALL ON TABLE "public"."ticket_note_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_note_mentions" TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. Note-level deep-link support on notifications
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."notifications"
    ADD COLUMN IF NOT EXISTS "ticket_event_id" "uuid";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'notifications_ticket_event_id_fkey'
    ) THEN
        ALTER TABLE ONLY "public"."notifications"
            ADD CONSTRAINT "notifications_ticket_event_id_fkey"
            FOREIGN KEY ("ticket_event_id") REFERENCES "public"."ticket_events"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Recipient-scoped RLS on notifications (ADR-025 §5)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "notifications_access_by_account" ON "public"."notifications";

CREATE POLICY "notifications_access_by_recipient" ON "public"."notifications"
    USING ((("account_id" = "public"."current_account_id"()) AND ("recipient_user_id" = "auth"."uid"())));
