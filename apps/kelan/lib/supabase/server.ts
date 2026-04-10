import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@kairo/types';

/**
 * Session client — reads the authenticated user from the request cookies.
 * Uses the anon key; subject to RLS.
 *
 * Phase 2 note: cross-tenant dashboard queries will need a service role client.
 * Add it here when needed, gated behind verifyAdminSession().
 */
export async function createSessionClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase anon configuration');
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(_cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        // Server components cannot set cookies; session refresh is handled
        // by the middleware on every request.
      },
    },
  });
}
