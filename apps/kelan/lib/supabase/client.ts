'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@kairo/types';

/**
 * Browser client — uses the anon key, subject to RLS.
 * Safe to use in client components. Never receives the service role key.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase public configuration');
  }

  return createBrowserClient<Database>(url, key);
}
