import { supabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Shared auth helpers for API route handlers (ADR-022).
// ---------------------------------------------------------------------------

/**
 * Resolves the Supabase user from a Bearer token and fetches the active
 * accountId from account_members.  Returns null if either lookup fails.
 */
export async function resolveUserAndAccount(
  authHeader: string
): Promise<{ userId: string; accountId: string } | null> {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: memberRow } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!memberRow?.account_id) return null;

  return { userId: user.id, accountId: memberRow.account_id as string };
}
