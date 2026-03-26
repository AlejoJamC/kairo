import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";
import { env } from "@/env";

export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
