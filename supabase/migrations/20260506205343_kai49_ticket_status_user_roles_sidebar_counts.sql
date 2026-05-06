-- KAI-49: ticket status enum extension + user_roles RBAC table + sidebar counts RPC

-- ─────────────────────────────────────────────────────────────
-- 1. Ticket status CHECK constraint
--    Current: no constraint (plain text column)
--    New: explicit allowed set including awaiting_customer
-- ─────────────────────────────────────────────────────────────
ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status IN (
    'open',
    'awaiting_customer',
    'in_progress',
    'resolved',
    'auto_resolved',
    'guided',
    'escalated'
  ));

-- ─────────────────────────────────────────────────────────────
-- 2. archived_at column on tickets
--    Required by get_sidebar_counts RPC to exclude archived tickets
-- ─────────────────────────────────────────────────────────────
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Sidebar counts RPC
--    Returns per-status ticket count for a user, excluding archived
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_sidebar_counts(p_user_id UUID)
RETURNS TABLE(status TEXT, count BIGINT)
LANGUAGE SQL STABLE
SECURITY DEFINER
AS $$
  SELECT status, COUNT(*) AS count
  FROM tickets
  WHERE user_id = p_user_id
    AND archived_at IS NULL
  GROUP BY status;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. user_roles table for dashboard RBAC (KAI-15 / ADR-008)
--    Separate from admin_users (Kelan backoffice).
--    One row per user; unique constraint enforces single role.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'supervisor', 'agent')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own role"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Seed: all existing auth users get 'owner' role
INSERT INTO user_roles (user_id, role)
SELECT id, 'owner'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
