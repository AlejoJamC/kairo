import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@kairo/types";
import { getClientConfig } from "./config";

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createClient() {
  if (client) return client;

  const { supabaseUrl, supabaseAnonKey, platform } = getClientConfig();
  client = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: platform.storage,
    },
  });

  return client;
}
