-- KAI-168 — Operational SLA by ticket priority (new domain, separate from
-- the existing tenant/plan-tier contractual SLA in tenant_sla_rules).
-- Calendar-time (24/7) only for now; all timing math lives in a single pure
-- function (apps/api/src/lib/operational-sla.ts) so a future business-hours
-- mode only needs to change that function.

-- ---------------------------------------------------------------------------
-- ticket_priority_sla_config — per-account, per-priority configurable times
-- ---------------------------------------------------------------------------

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
    CONSTRAINT "ticket_priority_sla_config_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_priority_sla_config_account_priority_key" UNIQUE ("account_id", "priority"),
    CONSTRAINT "chk_ticket_priority_sla_priority" CHECK (("priority" = ANY (ARRAY['P1'::"text", 'P2'::"text", 'P3'::"text"]))),
    CONSTRAINT "chk_ticket_priority_sla_positive" CHECK (
        "max_response_seconds" > 0 AND
        "min_response_seconds" > 0 AND
        "risk_alert_seconds" > 0 AND
        "escalation_seconds" > 0 AND
        "min_response_seconds" < "max_response_seconds"
    )
);

ALTER TABLE "public"."ticket_priority_sla_config" OWNER TO "postgres";

ALTER TABLE ONLY "public"."ticket_priority_sla_config"
    ADD CONSTRAINT "ticket_priority_sla_config_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

CREATE INDEX "idx_ticket_priority_sla_config_account_id" ON "public"."ticket_priority_sla_config" USING "btree" ("account_id");

ALTER TABLE "public"."ticket_priority_sla_config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_priority_sla_config_access_by_account" ON "public"."ticket_priority_sla_config"
    USING (("account_id" = "public"."current_account_id"()));

GRANT ALL ON TABLE "public"."ticket_priority_sla_config" TO "anon";
GRANT ALL ON TABLE "public"."ticket_priority_sla_config" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_priority_sla_config" TO "service_role";

-- ---------------------------------------------------------------------------
-- ticket_priority_sla_events — audit + idempotency guard for the escalation
-- cron (ensures we don't re-notify on every tick)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."ticket_priority_sla_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ticket_priority_sla_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_priority_sla_events_ticket_event_key" UNIQUE ("ticket_id", "event_type"),
    CONSTRAINT "chk_ticket_priority_sla_events_type" CHECK (("event_type" = ANY (ARRAY['risk_alert'::"text", 'escalated'::"text"])))
);

ALTER TABLE "public"."ticket_priority_sla_events" OWNER TO "postgres";

ALTER TABLE ONLY "public"."ticket_priority_sla_events"
    ADD CONSTRAINT "ticket_priority_sla_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ticket_priority_sla_events"
    ADD CONSTRAINT "ticket_priority_sla_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

CREATE INDEX "idx_ticket_priority_sla_events_account_id" ON "public"."ticket_priority_sla_events" USING "btree" ("account_id");
CREATE INDEX "idx_ticket_priority_sla_events_ticket_id" ON "public"."ticket_priority_sla_events" USING "btree" ("ticket_id");

ALTER TABLE "public"."ticket_priority_sla_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_priority_sla_events_access_by_account" ON "public"."ticket_priority_sla_events"
    USING (("account_id" = "public"."current_account_id"()));

GRANT ALL ON TABLE "public"."ticket_priority_sla_events" TO "anon";
GRANT ALL ON TABLE "public"."ticket_priority_sla_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_priority_sla_events" TO "service_role";

-- ---------------------------------------------------------------------------
-- notifications — generic in-app notifications (first consumer: SLA
-- escalation; the `kind` column allows future notification types)
-- ---------------------------------------------------------------------------

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
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."notifications" OWNER TO "postgres";

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;

CREATE INDEX "idx_notifications_account_id" ON "public"."notifications" USING "btree" ("account_id");
CREATE INDEX "idx_notifications_recipient_user_id" ON "public"."notifications" USING "btree" ("recipient_user_id");

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_access_by_account" ON "public"."notifications"
    USING (("account_id" = "public"."current_account_id"()));

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";
