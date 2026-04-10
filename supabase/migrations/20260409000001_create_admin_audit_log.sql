-- Admin audit log — tracks all write operations performed through Kelan.
-- See ADR-018 Security section. Populated in Phase 2+.

CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL,          -- 'update_ticket', 'deactivate_user', etc.
  target_table TEXT NOT NULL,
  target_id UUID,
  changes JSONB,                 -- {field: {old: x, new: y}}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying audit log by admin
CREATE INDEX idx_admin_audit_log_admin_user_id ON admin_audit_log(admin_user_id);
-- Index for querying audit log by target
CREATE INDEX idx_admin_audit_log_target ON admin_audit_log(target_table, target_id);

-- RLS: Admins can read audit logs; superadmins can manage
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_audit_log_read" ON admin_audit_log
  FOR SELECT USING (
    auth.uid() IN (SELECT auth_uid FROM admin_users WHERE is_active = true)
  );

CREATE POLICY "superadmin_audit_log_manage" ON admin_audit_log
  FOR ALL USING (
    auth.uid() IN (SELECT auth_uid FROM admin_users WHERE role = 'superadmin')
  );
