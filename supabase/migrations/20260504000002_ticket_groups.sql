-- ticket_groups: manual grouping of related tickets by tenant
CREATE TABLE IF NOT EXISTS ticket_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES ticket_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tickets_group_id_idx ON tickets(group_id) WHERE group_id IS NOT NULL;

ALTER TABLE ticket_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_owns_groups" ON ticket_groups
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
