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

  // Fetch the access token for this user
  const { data: gmailAccount } = await supabase
    .from("gmail_accounts")
    .select("access_token")
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (!gmailAccount?.access_token) {
    return c.json({ error: "No Gmail account connected" }, 400);
  }

  await inngest.send({
    name: "pipeline/incremental-sync.triggered",
    data: {
      userId,
      gmailAccessToken: gmailAccount.access_token as string,
    },
  });

  return c.json({ status: "triggered" });
});
