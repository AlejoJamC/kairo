import { Hono } from "hono";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";
import type { TicketStatus } from "../../lib/ticket-status-machine.js";

export const sidebar = new Hono();

// GET /v1/sidebar/counts
sidebar.get("/counts", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase.rpc("get_sidebar_counts", {
    p_account_id: ctx.accountId,
  });

  if (error) return c.json({ error: error.message }, 500);

  const counts: Partial<Record<TicketStatus, number>> = {};
  for (const row of data ?? []) {
    counts[row.status as TicketStatus] = Number(row.count);
  }

  return c.json(counts);
});
