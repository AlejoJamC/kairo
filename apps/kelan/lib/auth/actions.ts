'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Signs the current admin out and redirects to the login page.
 */
export async function signOut(): Promise<never> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error('Missing Supabase configuration');

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.signOut();

  redirect(ROUTES.LOGIN);
}
