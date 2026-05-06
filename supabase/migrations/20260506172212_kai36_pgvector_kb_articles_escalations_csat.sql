-- KAI-36: pgvector, kb_articles, escalation_contacts, escalations, support_schedules, csat_events
-- Extension must be enabled before any vector(512) columns are created.
-- In Supabase, pgvector lives in the 'extensions' schema. Setting search_path
-- here makes the 'vector' type available without schema-qualifying every column.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
SET search_path TO public, extensions;

-- ─── tickets: add embedding columns (nullable, non-disruptive) ────────────────
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS embedding vector(512),
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

-- HNSW index with explicit params so behaviour is stable across pgvector versions.
-- m=16, ef_construction=64 are pgvector defaults but declared explicitly per ADR-012.
CREATE INDEX IF NOT EXISTS idx_tickets_embedding
  ON tickets USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── kb_articles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_articles (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  embedding    vector(512),
  tags         TEXT[],
  is_published BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own kb_articles"
  ON kb_articles USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_kb_articles_embedding
  ON kb_articles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── escalation_contacts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalation_contacts (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  phone_number     TEXT    NOT NULL,  -- E.164 format: +1234567890
  channel          TEXT    NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'whatsapp')),
  escalation_level INTEGER NOT NULL DEFAULT 2,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE escalation_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own escalation_contacts"
  ON escalation_contacts USING (auth.uid() = user_id);

-- ─── escalations ──────────────────────────────────────────────────────────────
-- In MVP user_id and escalated_by are the same (single-agent per tenant).
-- escalated_by is kept separate for the future IAM/multi-tenant project that
-- will introduce proper agent identities and team roles.
CREATE TABLE IF NOT EXISTS escalations (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id            UUID    NOT NULL REFERENCES tickets(id),
  user_id              UUID    NOT NULL REFERENCES auth.users(id),
  escalated_to_level   INTEGER NOT NULL,
  escalated_by         UUID    NOT NULL REFERENCES auth.users(id),
  reason               TEXT,
  context              JSONB,   -- { area, history_summary, time_elapsed_minutes }
  notification_sent    BOOLEAN DEFAULT false,
  notification_channel TEXT,
  notification_sent_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own escalations"
  ON escalations USING (auth.uid() = user_id);

-- ─── support_schedules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_schedules (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME    NOT NULL,
  end_time    TIME    NOT NULL,
  timezone    TEXT    NOT NULL DEFAULT 'America/Bogota',
  UNIQUE(user_id, day_of_week)
);

ALTER TABLE support_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own support_schedules"
  ON support_schedules USING (auth.uid() = user_id);

-- ─── csat_events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS csat_events (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID    NOT NULL REFERENCES tickets(id),
  user_id      UUID    NOT NULL REFERENCES auth.users(id),
  score        INTEGER CHECK (score BETWEEN 1 AND 5),
  comment      TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE csat_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own csat_events"
  ON csat_events USING (auth.uid() = user_id);

-- ─── RPC: find_similar_tickets ────────────────────────────────────────────────
-- Uses p_user_id to scope results to the tenant. RLS also applies on the tickets
-- table, so if the source ticket belongs to another tenant, the function returns
-- 0 rows silently (no error). Accepted MVP behaviour.
CREATE OR REPLACE FUNCTION find_similar_tickets(
  p_ticket_id UUID,
  p_user_id   UUID,
  p_limit     INTEGER DEFAULT 5,
  p_threshold DOUBLE PRECISION DEFAULT 0.80
)
RETURNS TABLE(ticket_id UUID, similarity DOUBLE PRECISION)
LANGUAGE SQL STABLE
AS $$
  SELECT
    t.id AS ticket_id,
    1 - (t.embedding <=> source.embedding) AS similarity
  FROM tickets t,
    (SELECT embedding FROM tickets WHERE id = p_ticket_id) AS source
  WHERE t.user_id = p_user_id
    AND t.id != p_ticket_id
    AND t.embedding IS NOT NULL
    AND source.embedding IS NOT NULL
    AND 1 - (t.embedding <=> source.embedding) > p_threshold
  ORDER BY t.embedding <=> source.embedding
  LIMIT p_limit;
$$;

-- ─── RPC: find_relevant_kb ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION find_relevant_kb(
  p_query_embedding vector(512),
  p_user_id         UUID,
  p_limit           INTEGER DEFAULT 3
)
RETURNS TABLE(article_id UUID, title TEXT, similarity DOUBLE PRECISION)
LANGUAGE SQL STABLE
AS $$
  SELECT
    id AS article_id,
    title,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM kb_articles
  WHERE user_id = p_user_id
    AND is_published = true
    AND embedding IS NOT NULL
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit;
$$;
