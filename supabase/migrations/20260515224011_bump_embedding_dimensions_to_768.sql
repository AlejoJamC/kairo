-- Bump embedding columns from vector(512) → vector(768).
--
-- Reason: local dev uses Ollama's `nomic-embed-text`, which emits 768-dim
-- vectors. The previous 512 schema (sized for voyage-3-lite) caused every
-- ticket-embedding insert to fail with "expected 512 dimensions, not 768".
--
-- Steps:
--  1. Drop HNSW indexes (they are tied to the column type).
--  2. Null out existing embeddings — they're 512-dim and incompatible with
--     the new column type; pgvector won't ALTER through dimension changes
--     when non-null values are present.
--  3. Alter both columns to vector(768).
--  4. Recreate HNSW indexes with the same parameters as before.

DROP INDEX IF EXISTS "public"."idx_tickets_embedding";
DROP INDEX IF EXISTS "public"."idx_kb_articles_embedding";

UPDATE "public"."tickets"
   SET "embedding" = NULL,
       "embedding_updated_at" = NULL
 WHERE "embedding" IS NOT NULL;

UPDATE "public"."kb_articles"
   SET "embedding" = NULL
 WHERE "embedding" IS NOT NULL;

ALTER TABLE "public"."tickets"
  ALTER COLUMN "embedding" TYPE "extensions"."vector"(768);

ALTER TABLE "public"."kb_articles"
  ALTER COLUMN "embedding" TYPE "extensions"."vector"(768);

CREATE INDEX "idx_tickets_embedding"
    ON "public"."tickets"
 USING "hnsw" ("embedding" "extensions"."vector_cosine_ops")
  WITH ("m" = '16', "ef_construction" = '64');

CREATE INDEX "idx_kb_articles_embedding"
    ON "public"."kb_articles"
 USING "hnsw" ("embedding" "extensions"."vector_cosine_ops")
  WITH ("m" = '16', "ef_construction" = '64');
