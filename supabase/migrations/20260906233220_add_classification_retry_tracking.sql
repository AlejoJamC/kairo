-- Plan E: explicit, observable retry for messages whose classification
-- failed, decoupled from any business-side trigger (e.g. login). Unified
-- across every call site (tier1/tier2/tier3/incremental-sync/gmail-poll) —
-- all five write to this table today with no way to distinguish a
-- transient failure (worth retrying) from a permanent one (never will
-- succeed), and none persist enough content for a later retry to work with.

-- Content needed to reconstruct classifyEmailWithMeta's input on a retry.
-- Every existing write path (skip/success/failure) already has `subject` in
-- scope as a local variable; it was simply never included in the message
-- row, so no message in this table can currently be reclassified without it.
ALTER TABLE "public"."messages" ADD COLUMN "subject" "text";

-- Retry bookkeeping — same shape as the existing `send_attempts` pattern in
-- this table (KAI-114, outbound delivery), scoped separately with a
-- `classification_` prefix since both concepts live on the same row.
ALTER TABLE "public"."messages" ADD COLUMN "classification_attempt_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."messages" ADD COLUMN "last_classification_attempt_at" timestamp with time zone;

-- 'failed' becomes non-terminal: an attempt failed for a transient reason
-- (ProviderError.retriable = true) and is eligible for the retry sweep.
-- 'failed_permanent' is the new terminal state: either a non-retriable
-- ProviderError (bad prompt, schema mismatch — will fail identically every
-- time) or a retriable one that exhausted classification_attempt_count.
ALTER TABLE "public"."messages" DROP CONSTRAINT "messages_classification_status_check";
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_classification_status_check"
  CHECK (("classification_status" IS NULL) OR ("classification_status" = ANY (ARRAY[
    'pending'::"text", 'classified'::"text", 'skipped'::"text", 'failed'::"text", 'failed_permanent'::"text"
  ])));
