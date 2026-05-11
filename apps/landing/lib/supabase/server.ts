import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient as createBaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { env } from "@/env";

/**
 * Authenticates a request by checking the Authorization: Bearer header first,
 * then falling back to cookie-based auth. This supports the dashboard (which stores
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

/**
 * Creates a Supabase client whose queries run under the caller's identity.
 *
 * Priority:
 *  1. Authorization: Bearer <jwt> header (dashboard SPA — session in localStorage)
 *  2. Cookie-based session (Next.js server components / SSR flows)
 *
 * Using a plain supabase-js client with the JWT in `global.headers` ensures
 * PostgREST receives the token in every query, so RLS `auth.uid()` resolves
 * to the correct user instead of NULL.
 */
export async function createClientForRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    return createBaseClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      }
    );
  }

  return createClient();
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
