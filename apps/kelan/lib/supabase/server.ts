import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@kairo/types';

/**
 * Service role client — bypasses ALL RLS.
 * Returns an untyped client; callers cast results to the appropriate types.
 *
 * Use ONLY in server-side API routes after verifying admin session.
 * NEVER import in client components. NEVER expose SUPABASE_SERVICE_ROLE_KEY
 * via a NEXT_PUBLIC_ variable.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase service role configuration');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Session client — reads the authenticated user from the request cookies.
 * Uses the anon key; subject to RLS. Use this to verify the current session.
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
