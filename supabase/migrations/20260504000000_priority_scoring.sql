-- Migration: priority_scoring
-- KAI-16: Add composite priority score columns to tickets and create
--          tenant_priority_config / tenant_sla_rules tables.
--
-- All new columns are nullable — existing rows get NULL and are sorted
-- to the bottom of the priority queue until the pipeline re-processes them.

-- ---------------------------------------------------------------------------
-- 1. Add scoring columns to tickets
-- ---------------------------------------------------------------------------

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS priority_score    DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS emotion           TEXT,
  ADD COLUMN IF NOT EXISTS emotion_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS sla_due_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score_computed_at TIMESTAMPTZ;

ALTER TABLE tickets
  ADD CONSTRAINT chk_emotion CHECK (
    emotion IS NULL OR
    emotion IN ('aggressive', 'frustrated', 'neutral', 'positive')
  ),
  ADD CONSTRAINT chk_priority_score CHECK (
    priority_score IS NULL OR (priority_score >= 0.000 AND priority_score <= 1.000)
  );

-- Index for sorted left-panel queries
CREATE INDEX IF NOT EXISTS idx_tickets_priority_score
  ON tickets (user_id, priority_score DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 2. Tenant weight configuration
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_priority_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_type   DECIMAL(3,2) NOT NULL DEFAULT 0.30,
  weight_plan   DECIMAL(3,2) NOT NULL DEFAULT 0.35,
  weight_emotion DECIMAL(3,2) NOT NULL DEFAULT 0.20,
  weight_age    DECIMAL(3,2) NOT NULL DEFAULT 0.15,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id),
  CONSTRAINT chk_weights_sum CHECK (
    ABS((weight_type + weight_plan + weight_emotion + weight_age) - 1.00) < 0.01
  )
);

ALTER TABLE tenant_priority_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_priority_config_owner" ON tenant_priority_config
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Tenant SLA rules
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_sla_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_type      TEXT NOT NULL,
  plan_tier        TEXT NOT NULL CHECK (plan_tier IN ('enterprise', 'pro', 'starter', 'none')),
  response_hours   INTEGER NOT NULL,
  resolution_hours INTEGER,
  UNIQUE (user_id, ticket_type, plan_tier)
);

ALTER TABLE tenant_sla_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_sla_rules_owner" ON tenant_sla_rules
  USING (user_id = auth.uid());
