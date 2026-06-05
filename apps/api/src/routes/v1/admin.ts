import { Hono } from "hono";
import { inngest } from "../../lib/inngest.js";
import { resolveUserAndAccount } from "../../lib/auth.js";
import { supabase } from "../../lib/supabase.js";

// ---------------------------------------------------------------------------
// Admin routes — restricted to owner/admin roles
// ---------------------------------------------------------------------------

export const admin = new Hono();

// ---------------------------------------------------------------------------
// Helper: require role guard
// ---------------------------------------------------------------------------

async function requireRole(
  authHeader: string,
  roles: string[]
): Promise<{ userId: string; accountId: string } | null> {
  const ctx = await resolveUserAndAccount(authHeader);
  if (!ctx) return null;

  const { data: member } = await supabase
    .from("account_members")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("account_id", ctx.accountId)
    .eq("status", "active")
    .maybeSingle();

  if (!member || !roles.includes(member.role)) return null;
  return ctx;
}

// ---------------------------------------------------------------------------
// POST /api/v1/admin/backfill/thread-dedupe
// Trigger the thread deduplication backfill Inngest function.
// Body: { accountId?: string } — null = all accounts (owner only)
// ---------------------------------------------------------------------------

admin.post("/backfill/thread-dedupe", async (c) => {
  const ctx = await requireRole(c.req.header("Authorization") ?? "", ["owner", "admin"]);
  if (!ctx) return c.json({ error: "Forbidden — requires owner or admin role" }, 403);

  let body: { accountId?: string | null } = {};
  try {
    body = await c.req.json();
  } catch {
    // no body is fine — defaults to current account
  }

  // Default to the caller's own account for safety
  const accountId = body.accountId ?? ctx.accountId;

  await inngest.send({
    name: "admin/thread-dedupe.triggered",
    data: { accountId },
  });

  return c.json({ triggered: true, accountId });
});
