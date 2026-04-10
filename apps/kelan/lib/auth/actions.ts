'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

type CookieToSet = { name: string; value: string; options: CookieOptions };

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_KELAN_URL ?? 'http://localhost:3002';
}

function getSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, key };
}

/**
 * Initiates Google OAuth flow via Supabase Auth.
 * Redirects the browser to the Google consent page.
 * The OAuth callback will land at /auth/callback.
 */
export async function signInWithGoogle(): Promise<never> {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig();

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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${getBaseUrl()}${ROUTES.AUTH_CALLBACK}`,
    },
  });

  if (error || !data.url) {
    redirect(`${ROUTES.LOGIN}?error=oauth_failed`);
  }

  redirect(data.url);
}

/**
 * Signs the current admin out and redirects to the login page.
 */
export async function signOut(): Promise<never> {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig();

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
