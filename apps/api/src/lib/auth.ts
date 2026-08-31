import { supabase } from "./supabase.js";
import type { DashboardRole } from "../middleware/rbac-check.js";

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

/**
 * Resolves the caller's role for a given account.
 *
 * KAI-191 — `requireRole` (middleware/rbac.ts) reads the account from the
 * `x-account-id` header, which is a different mechanism than the one routes
 * built on resolveUserAndAccount() use (the account is derived from the
 * caller's own membership, from the Authorization header alone). Those two
 * cannot be mixed without changing how those routes authenticate, so this
 * helper composes with resolveUserAndAccount() instead: same
 * (userId, accountId) pair, just also reading `role`. See admin.ts's local
 * `requireRole` for the existing precedent of this same composition.
 *
 * Returns null when the caller has no active membership on that account
 * (should not happen for a (userId, accountId) pair that came out of
 * resolveUserAndAccount(), which only ever returns active memberships).
 */
export async function resolveMemberRole(
  userId: string,
  accountId: string
): Promise<DashboardRole | null> {
  const { data: member } = await supabase
    .from("account_members")
    .select("role")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("status", "active")
    .maybeSingle();

  if (!member) return null;
  return member.role as DashboardRole;
}
