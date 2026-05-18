import { Hono } from "hono";
import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";

export const sync = new Hono();

/**
 * POST /v1/sync/trigger
 *
 * Dispatches pipeline/incremental-sync.triggered for the given userId.
 * Called by the dashboard on load — requires the onboarding pipeline to have
 * run at least once (messages table must have rows for this user).
 *
 * Returns immediately; does not wait for the sync to complete.
 */
sync.post("/trigger", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const userId = (body as Record<string, unknown>)?.userId;
  if (typeof userId !== "string" || !userId) {
    return c.json({ error: "userId is required" }, 400);
  }

  // Verify user has prior classified messages — if not, onboarding hasn't run
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("classification_status", "is", null);

  if (!count || count === 0) {
    return c.json({ status: "skipped", reason: "onboarding_not_complete" });
  }

  // Resolve accountId to verify Gmail is connected (ADR-022 Phase 2).
  const { data: memberRow } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const accountId = memberRow?.account_id;

  if (accountId) {
    // Check oauth_credentials first (canonical), fallback to gmail_accounts (legacy).
    const { data: cred } = await supabase
      .from("oauth_credentials")
      .select("id")
      .eq("account_id", accountId)
      .eq("provider", "gmail")
      .limit(1)
      .maybeSingle();

    if (!cred) {
      const { data: legacy } = await supabase
        .from("gmail_accounts")
        .select("id")
        .eq("account_id", accountId)
        .limit(1)
        .maybeSingle();

      if (!legacy) {
        return c.json({ error: "No Gmail account connected" }, 400);
      }
      console.warn(`[sync] oauth_credentials missing for account=${accountId} — using gmail_accounts fallback`);
    }
  } else {
    // accountId not resolved — fallback to user_id lookup on gmail_accounts
    const { data: legacy } = await supabase
      .from("gmail_accounts")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!legacy) {
      return c.json({ error: "No Gmail account connected" }, 400);
    }
  }

  await inngest.send({
    name: "pipeline/incremental-sync.triggered",
    data: { userId },
  });

  return c.json({ status: "triggered" });
});
