// KAI-40: tenant support-schedule CRUD.
//
//   GET    /v1/support-schedule              → all 7 days for the tenant
//   PUT    /v1/support-schedule              → upsert one day
//   DELETE /v1/support-schedule/:dayOfWeek   → remove one day (= closed)
//
// Tenant isolation = user_id (matches existing tenant routes).

import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";

export const supportSchedule = new Hono();

async function resolveUser(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const ScheduleEntrySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(HHMM, "Expected HH:MM or HH:MM:SS"),
  end_time:   z.string().regex(HHMM, "Expected HH:MM or HH:MM:SS"),
  timezone:   z.string().min(1),
});

// ---------------------------------------------------------------------------
// GET /v1/support-schedule
// ---------------------------------------------------------------------------

supportSchedule.get("/", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase
    .from("support_schedules")
    .select("day_of_week, start_time, end_time, timezone")
    .eq("user_id", user.id)
    .order("day_of_week", { ascending: true });

  if (error) {
    return c.json({ error: "Failed to load schedule", detail: error.message }, 500);
  }

  return c.json({ schedule: data ?? [] });
});

// ---------------------------------------------------------------------------
// PUT /v1/support-schedule  (upsert one day)
// ---------------------------------------------------------------------------

supportSchedule.put("/", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = ScheduleEntrySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid schedule entry", detail: parsed.error.flatten() }, 400);
  }

  const entry = parsed.data;

  const { data, error } = await supabase
    .from("support_schedules")
    .upsert(
      { user_id: user.id, ...entry },
      { onConflict: "user_id,day_of_week" }
    )
    .select("day_of_week, start_time, end_time, timezone")
    .single();

  if (error) {
    return c.json({ error: "Failed to save schedule", detail: error.message }, 500);
  }

  return c.json(data);
});

// ---------------------------------------------------------------------------
// DELETE /v1/support-schedule/:dayOfWeek
// ---------------------------------------------------------------------------

supportSchedule.delete("/:dayOfWeek", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const dayOfWeek = Number(c.req.param("dayOfWeek"));
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return c.json({ error: "day_of_week must be an integer 0..6" }, 400);
  }

  const { error } = await supabase
    .from("support_schedules")
    .delete()
    .eq("user_id", user.id)
    .eq("day_of_week", dayOfWeek);

  if (error) {
    return c.json({ error: "Failed to delete schedule", detail: error.message }, 500);
  }

  return c.body(null, 204);
});
