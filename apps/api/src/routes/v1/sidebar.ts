import { Hono } from "hono";
import { supabase } from "../../lib/supabase.js";
import type { TicketStatus } from "../../lib/ticket-status-machine.js";

export const sidebar = new Hono();

// GET /v1/sidebar/counts
// Calls get_sidebar_counts RPC and returns a flat { status: count } object.
// Statuses not present in the result are omitted (zero means the ticket doesn't exist).
sidebar.get("/counts", async (c) => {
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return c.json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase.rpc("get_sidebar_counts", {
    p_user_id: user.id,
  });

  if (error) return c.json({ error: error.message }, 500);

  const counts: Partial<Record<TicketStatus, number>> = {};
  for (const row of data ?? []) {
    counts[row.status as TicketStatus] = Number(row.count);
  }

  return c.json(counts);
});
