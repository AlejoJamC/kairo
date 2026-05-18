import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";
import { emitTicketEvent } from "../../lib/ticket-events.js";

export const ticketGroups = new Hono();

// ---------------------------------------------------------------------------
// POST /v1/ticket-groups — create a new group
// ---------------------------------------------------------------------------

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(255),
});

ticketGroups.post("/", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = CreateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);
  }

  const { data, error } = await supabase
    .from("ticket_groups")
    .insert({ account_id: ctx.accountId, name: parsed.data.name })
    .select("id, name, created_at")
    .single();

  if (error || !data) return c.json({ error: "Failed to create group" }, 500);

  return c.json(data, 201);
});

// ---------------------------------------------------------------------------
// POST /v1/ticket-groups/:id/tickets — assign tickets to a group
// ---------------------------------------------------------------------------

const AddTicketsSchema = z.object({
  ticket_ids: z.array(z.string().uuid()).min(1).max(100),
});

ticketGroups.post("/:id/tickets", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const groupId = c.req.param("id");

  // Verify group belongs to this account (RLS also enforces, this is a belt-and-suspenders check)
  const { data: group, error: groupErr } = await supabase
    .from("ticket_groups")
    .select("id")
    .eq("id", groupId)
    .eq("account_id", ctx.accountId)
    .single();

  if (groupErr || !group) return c.json({ error: "Group not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = AddTicketsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);
  }

  const { error } = await supabase
    .from("tickets")
    .update({ group_id: groupId })
    .in("id", parsed.data.ticket_ids)
    .eq("account_id", ctx.accountId);

  if (error) return c.json({ error: "Failed to assign tickets", detail: error.message }, 500);

  await Promise.all(
    parsed.data.ticket_ids.map((ticketId) =>
      emitTicketEvent({
        ticketId,
        authorId: ctx.userId,
        eventType: "grouped",
        metadata: { group_id: groupId },
      })
    )
  );

  return c.json({ group_id: groupId, ticket_ids: parsed.data.ticket_ids });
});

// ---------------------------------------------------------------------------
// DELETE /v1/ticket-groups/:id/tickets/:ticketId — remove ticket from group
// ---------------------------------------------------------------------------

ticketGroups.delete("/:id/tickets/:ticketId", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const groupId  = c.req.param("id");
  const ticketId = c.req.param("ticketId");

  // Verify group belongs to this account
  const { data: group, error: groupErr } = await supabase
    .from("ticket_groups")
    .select("id")
    .eq("id", groupId)
    .eq("account_id", ctx.accountId)
    .single();

  if (groupErr || !group) return c.json({ error: "Group not found" }, 404);

  const { error } = await supabase
    .from("tickets")
    .update({ group_id: null })
    .eq("id", ticketId)
    .eq("group_id", groupId)
    .eq("account_id", ctx.accountId);

  if (error) return c.json({ error: "Failed to remove ticket from group", detail: error.message }, 500);

  return c.json({ removed: true, ticket_id: ticketId, group_id: groupId });
});
