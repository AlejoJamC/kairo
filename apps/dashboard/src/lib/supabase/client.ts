import {createClient as createSupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/supabase";
import {env} from "@/env";

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createClient() {
    if (client) return client;

    client = createSupabaseClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
        },
    });

    return client;
}
