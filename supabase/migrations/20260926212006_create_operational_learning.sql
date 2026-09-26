-- KAI-55 — operational learning: what Kairo learns from operating a
-- client's support, as distinct from kb_articles (external, client-owned
-- documentation used to answer tickets — a different domain).
--
-- Two origins, two starting trust levels:
--   human_correction — a person corrected or confirmed something. The
--     correction IS the approval; these rows are written already approved.
--   system_derived   — Kairo inferred a pattern with nobody correcting it
--     directly. Starts pending_review; nobody has vouched for it yet.
--
-- Always scoped to one account (account_id NOT NULL, no shared/global row).
-- Cross-account sharing has no defined strategy yet, so nothing here assumes
-- one — adding it later is a new table or a nullable column, not a rework
-- of this one.
--
-- This migration creates the table only. Detecting a system_derived
-- candidate (what pattern, from which tickets, at what confidence) is
-- separate, later work — this is where such a candidate would be written to
-- and read from, not what decides one exists.

CREATE TABLE IF NOT EXISTS "public"."operational_learning" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "account_id" uuid NOT NULL,
    "origin" text NOT NULL,
    "status" text NOT NULL,
    "learning_type" text NOT NULL,
    "summary" text NOT NULL,
    "ticket_ids" uuid[] NOT NULL DEFAULT '{}',
    "source_count" integer NOT NULL DEFAULT 0,
    "confidence" double precision,
    "reviewed_by" uuid,
    "reviewed_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "operational_learning_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_operational_learning_origin" CHECK (
      "origin" = ANY (ARRAY['human_correction', 'system_derived'])),
    CONSTRAINT "chk_operational_learning_status" CHECK (
      "status" = ANY (ARRAY['approved', 'pending_review', 'rejected'])),
    CONSTRAINT "chk_operational_learning_type" CHECK (
      "learning_type" = ANY (ARRAY[
        'resolution', 'diagnostic_pattern', 'routing_rule',
        'policy', 'exception', 'evaluation_example'
      ])),
    CONSTRAINT "chk_operational_learning_source_count" CHECK ("source_count" >= 0),
    CONSTRAINT "chk_operational_learning_confidence" CHECK (
      "confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

ALTER TABLE "public"."operational_learning" OWNER TO "postgres";

COMMENT ON TABLE "public"."operational_learning" IS
  'What Kairo has learned from operating one account''s support — resolutions, '
  'diagnostic patterns, routing rules and the like. Not kb_articles: that is '
  'external documentation the client owns; this is Kairo''s own operational '
  'knowledge, scoped to account_id, never shared across accounts today.';

COMMENT ON COLUMN "public"."operational_learning"."origin" IS
  'human_correction: a person''s correction is the approval, written already approved. '
  'system_derived: Kairo inferred this alone — starts pending_review.';

COMMENT ON COLUMN "public"."operational_learning"."status" IS
  'approved rows are usable. pending_review and rejected are not — a caller reads '
  'only approved unless it is specifically building the review queue.';

COMMENT ON COLUMN "public"."operational_learning"."ticket_ids" IS
  'The tickets this was derived or corrected from. A row with no evidence approves nothing.';

COMMENT ON COLUMN "public"."operational_learning"."confidence" IS
  'Null for human_correction — the person''s action is the trust signal, not a score.';

ALTER TABLE ONLY "public"."operational_learning"
    ADD CONSTRAINT "operational_learning_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."operational_learning"
    ADD CONSTRAINT "operational_learning_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX "idx_operational_learning_account_status" ON "public"."operational_learning" USING "btree" ("account_id", "status");

CREATE OR REPLACE TRIGGER "on_operational_learning_updated"
  BEFORE UPDATE ON "public"."operational_learning"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."operational_learning" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operational_learning_access_by_account" ON "public"."operational_learning"
  FOR ALL USING ("account_id" = "public"."current_account_id"());

GRANT ALL ON TABLE "public"."operational_learning" TO "anon";
GRANT ALL ON TABLE "public"."operational_learning" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_learning" TO "service_role";
