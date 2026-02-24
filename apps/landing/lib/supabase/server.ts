import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Authenticates a request by checking the Authorization: Bearer header first,
 * then falling back to cookie-based auth. This supports the webapp (which stores
 * the Supabase session in localStorage and sends it as a Bearer token) as well
 * as server-rendered pages (which use cookies).
 */
export async function getUserFromRequest(
  request: Request,
  supabase: SupabaseClient<Database>
) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (token) {
    return supabase.auth.getUser(token);
  }
  return supabase.auth.getUser();
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can fail in Server Components — safe to ignore
          }
        },
      },
    }
  );
}
