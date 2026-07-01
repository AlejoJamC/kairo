import { Hono } from "hono";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";

export const notifications = new Hono();

// ---------------------------------------------------------------------------
// GET /v1/notifications — in-app notifications for the current user.
// KAI-168's first (and currently only) producer is the operational SLA
// escalation cron (kind: 'sla_escalation'); the `kind` column allows future
// notification types to reuse this endpoint.
// ---------------------------------------------------------------------------

notifications.get("/", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);

  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, ticket_id, title, body, read_at, created_at")
    .eq("account_id", ctx.accountId)
    .eq("recipient_user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return c.json({ error: error.message }, 500);

  return c.json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// PATCH /v1/notifications/:id/read
// ---------------------------------------------------------------------------

notifications.patch("/:id/read", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .eq("recipient_user_id", ctx.userId);

  if (error) return c.json({ error: error.message }, 500);

  return c.json({ success: true });
});
