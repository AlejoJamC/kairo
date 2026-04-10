// Admin identity types for Kelan backoffice.
// These mirror the admin_users and admin_audit_log rows from database.ts
// but with the role field narrowed to the enum and changes typed precisely.
// See ADR-018 and supabase/migrations/20260409000000_create_admin_users.sql

export type AdminRole = 'admin' | 'superadmin';

export interface AdminUser {
  id: string;
  auth_uid: string;
  email: string;
  display_name: string;
  role: AdminRole;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_user_id: string;
  action: string;
  target_table: string;
  target_id: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  created_at: string;
}
