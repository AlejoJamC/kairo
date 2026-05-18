import { Hono } from "hono";
import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";

export const sync = new Hono();

/**
 * POST /v1/sync/trigger
 *
 * Dispatches pipeline/incremental-sync.triggered for the given userId.
 * Called by the dashboard on load — requires the onboarding pipeline to have
 * run at least once (messages table must have rows for this account).
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

  // Resolve accountId from membership
  const { data: memberRow } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const accountId = memberRow?.account_id;

  if (!accountId) {
    return c.json({ error: "No active account found for this user" }, 400);
  }

  // Verify user has prior classified messages (onboarding must have run at least once)
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .not("classification_status", "is", null);

  if (!count || count === 0) {
    return c.json({ status: "skipped", reason: "onboarding_not_complete" });
  }

  // Verify Gmail credentials exist
  const { data: cred } = await supabase
    .from("oauth_credentials")
    .select("id")
    .eq("account_id", accountId)
    .eq("provider", "gmail")
    .limit(1)
    .maybeSingle();

  if (!cred) {
    return c.json({ error: "No Gmail account connected" }, 400);
  }

  await inngest.send({
    name: "pipeline/incremental-sync.triggered",
    data: { userId },
  });

  return c.json({ status: "triggered" });
});
