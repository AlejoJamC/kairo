import type { AdminUser } from '@kairo/types';
import { createSessionClient } from '@/lib/supabase/server';

/**
 * Verifies that the current request has a valid, active admin session.
 * Uses the session client (user JWT) so RLS admin_users_self_read handles
 * access control — no service role key required for the admin check.
 */
export async function verifyAdminSession(): Promise<AdminUser | null> {
  try {
    const sessionClient = await createSessionClient();

    const {
      data: { user },
      error: sessionError,
    } = await sessionClient.auth.getUser();

    if (sessionError || !user) return null;

    const { data: adminUser } = await sessionClient
      .from('admin_users')
      .select('*')
      .eq('auth_uid', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!adminUser) return null;

    return adminUser as unknown as AdminUser;
  } catch {
    return null;
  }
}
