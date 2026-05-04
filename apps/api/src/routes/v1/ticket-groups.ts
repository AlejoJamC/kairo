import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";

export const ticketGroups = new Hono();

async function resolveUser(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ---------------------------------------------------------------------------
// POST /v1/ticket-groups — create a new group
// ---------------------------------------------------------------------------

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(255),
});

ticketGroups.post("/", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

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
    .insert({ user_id: user.id, name: parsed.data.name })
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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const groupId = c.req.param("id");

  // Verify group belongs to user
  const { data: group, error: groupErr } = await supabase
    .from("ticket_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", user.id)
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
    .eq("user_id", user.id);

  if (error) return c.json({ error: "Failed to assign tickets", detail: error.message }, 500);

  return c.json({ group_id: groupId, ticket_ids: parsed.data.ticket_ids });
});

// ---------------------------------------------------------------------------
// DELETE /v1/ticket-groups/:id/tickets/:ticketId — remove ticket from group
// ---------------------------------------------------------------------------

ticketGroups.delete("/:id/tickets/:ticketId", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const groupId = c.req.param("id");
  const ticketId = c.req.param("ticketId");

  // Verify group belongs to user
  const { data: group, error: groupErr } = await supabase
    .from("ticket_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .single();

  if (groupErr || !group) return c.json({ error: "Group not found" }, 404);

  const { error } = await supabase
    .from("tickets")
    .update({ group_id: null })
    .eq("id", ticketId)
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  if (error) return c.json({ error: "Failed to remove ticket from group", detail: error.message }, 500);

  return c.json({ removed: true, ticket_id: ticketId, group_id: groupId });
});
