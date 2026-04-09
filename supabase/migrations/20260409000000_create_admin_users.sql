-- Admin users are platform operators, not Kairo product users.
-- They authenticate via Supabase Auth (Google OAuth) but their
-- identity is tracked in a separate table with its own RLS policies.
-- See ADR-018 for full rationale.

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid UUID NOT NULL UNIQUE,          -- FK to auth.users (Supabase Auth)
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'       -- 'admin' | 'superadmin'
    CHECK (role IN ('admin', 'superadmin')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for auth lookup
CREATE INDEX idx_admin_users_auth_uid ON admin_users(auth_uid);

-- RLS: Only active admin users can read the admin_users table
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Active admins can read their own row
CREATE POLICY "admin_users_self_read" ON admin_users
  FOR SELECT USING (
    auth.uid() IN (SELECT auth_uid FROM admin_users WHERE is_active = true)
  );

-- Superadmins can manage all rows (insert, update, delete, select)
CREATE POLICY "superadmin_manage" ON admin_users
  FOR ALL USING (
    auth.uid() IN (SELECT auth_uid FROM admin_users WHERE role = 'superadmin')
  );
