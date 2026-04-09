import type { AdminUser } from '@kairo/types';
import { createSessionClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Verifies that the current request has a valid, active admin session.
 *
 * Flow:
 * 1. Read the Supabase session from cookies (anon client).
 * 2. If no authenticated user → return null.
 * 3. Query admin_users via service role client (bypasses RLS).
 * 4. Return the AdminUser row if active, null otherwise.
 *
 * Used identically in every protected API route:
 * ```
 * const admin = await verifyAdminSession();
 * if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });
 * ```
 */
export async function verifyAdminSession(): Promise<AdminUser | null> {
  try {
    const sessionClient = await createSessionClient();
    const {
      data: { user },
      error: sessionError,
    } = await sessionClient.auth.getUser();

    if (sessionError || !user) return null;

    const adminClient = createServiceRoleClient();
    const { data: adminUser, error: adminError } = await adminClient
      .from('admin_users')
      .select('*')
      .eq('auth_uid', user.id)
      .eq('is_active', true)
      .single();

    if (adminError || !adminUser) return null;

    return adminUser;
  } catch {
    return null;
  }
}
