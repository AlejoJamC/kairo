-- KAI-191: now that ticket_notes exists, repoint everything that used to
-- point at a ticket_events row of event_type='internal_note' — the mentions
-- table and the notification it fans out to — and rewrite the note-counting
-- RPC to read ticket_notes instead of ticket_events.

-- ---------------------------------------------------------------------------
-- ticket_note_mentions.ticket_event_id -> ticket_note_id
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."ticket_note_mentions"
    DROP CONSTRAINT "ticket_note_mentions_ticket_event_id_fkey";

ALTER TABLE "public"."ticket_note_mentions"
    DROP CONSTRAINT "ticket_note_mentions_event_user_key";

ALTER TABLE "public"."ticket_note_mentions"
    RENAME COLUMN "ticket_event_id" TO "ticket_note_id";

ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_ticket_note_id_fkey" FOREIGN KEY ("ticket_note_id") REFERENCES "public"."ticket_notes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ticket_note_mentions"
    ADD CONSTRAINT "ticket_note_mentions_note_user_key" UNIQUE ("ticket_note_id", "mentioned_user_id");

-- ---------------------------------------------------------------------------
-- notifications.ticket_event_id -> ticket_note_id
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."notifications"
    DROP CONSTRAINT "notifications_ticket_event_id_fkey";

ALTER TABLE "public"."notifications"
    RENAME COLUMN "ticket_event_id" TO "ticket_note_id";

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_ticket_note_id_fkey" FOREIGN KEY ("ticket_note_id") REFERENCES "public"."ticket_notes"("id") ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- get_ticket_note_counts — read ticket_notes instead of ticket_events
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- ticket_events no longer carries internal notes — ticket_notes does.
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."ticket_events"
    DROP CONSTRAINT "ticket_events_event_type_check";

ALTER TABLE "public"."ticket_events"
    ADD CONSTRAINT "ticket_events_event_type_check" CHECK (("event_type" = ANY (ARRAY[
        'reply_sent'::"text",
        'ai_classified'::"text",
        'human_classified'::"text",
        'ai_proposal'::"text",
        'ai_confirmed'::"text",
        'ai_rejected'::"text",
        'classification_corrected'::"text",
        'customer_replied'::"text"
    ])));
