// Admin identity types for Kelan backoffice.
// These match the admin_users and admin_audit_log migration schema.
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

// Standalone Supabase Database type for the admin service role client.
// Only includes the admin_users and admin_audit_log tables.
// Once migrations 20260409000000 and 20260409000001 are pushed and types
// are regenerated via `supabase gen types typescript`, these tables will be
// included in database.ts and this manual type can be removed.
export interface AdminDatabase {
  public: {
    Tables: {
      admin_users: {
        Row: AdminUser;
        Insert: {
          id?: string;
          auth_uid: string;
          email: string;
          display_name: string;
          role?: AdminRole;
          avatar_url?: string | null;
          is_active?: boolean;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_uid?: string;
          email?: string;
          display_name?: string;
          role?: AdminRole;
          avatar_url?: string | null;
          is_active?: boolean;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_audit_log: {
        Row: AdminAuditLog;
        Insert: {
          id?: string;
          admin_user_id: string;
          action: string;
          target_table: string;
          target_id?: string | null;
          changes?: Record<string, { old: unknown; new: unknown }> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_user_id?: string;
          action?: string;
          target_table?: string;
          target_id?: string | null;
          changes?: Record<string, { old: unknown; new: unknown }> | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
