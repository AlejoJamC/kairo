import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";

export const notes = new Hono();

// ---------------------------------------------------------------------------
// GET /v1/notes/counts — internal-note counters per ticket (KAI-232)
//
// Feeds the amber "🔒 n" chip in the triage queue and the note counter in the
// ticket header (design spec surface A). Computed by the `get_ticket_note_counts`
// RPC, never stored on `tickets`: it is derived state over an append-only event
// stream. `unread_mentions` is scoped to the caller — the blue dot means "you
// have an unread mention here".
//
// Lives in its own module rather than under /tickets so the literal path can
// never be shadowed by the `/:id` routes registered in tickets.ts.
//
// Response: { data: { [ticket_id]: { notes: number, unread_mentions: number } } }
// Keyed by ticket id so the queue can look up per row without scanning.
// ---------------------------------------------------------------------------

interface NoteCountRow {
  ticket_id: string;
  note_count: number | string;
  unread_mentions: number | string;
}

notes.get("/counts", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase.rpc("get_ticket_note_counts", {
    p_account_id: ctx.accountId,
    p_user_id: ctx.userId,
  });

  if (error) return c.json({ error: error.message }, 500);

  const counts: Record<string, { notes: number; unread_mentions: number }> = {};
  for (const row of (data ?? []) as NoteCountRow[]) {
    counts[row.ticket_id] = {
      notes: Number(row.note_count),
      unread_mentions: Number(row.unread_mentions),
    };
  }

  return c.json({ data: counts });
});

// ---------------------------------------------------------------------------
// PATCH /v1/notes/mentions/read — mark the caller's mentions on given notes read
//
// Called by the Notes tab after a note has been visible for 1.2s (design rule
// F.1: real reading, not a bulk dismiss). Also clears the matching bell
// notifications, since having read the note makes them stale.
// ---------------------------------------------------------------------------

const MentionsReadSchema = z.object({
  ticket_event_ids: z.array(z.string().uuid()).min(1).max(200),
});

notes.patch("/mentions/read", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = MentionsReadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);
  }

  const readAt = new Date().toISOString();
  const eventIds = parsed.data.ticket_event_ids;

  const { error } = await supabase
    .from("ticket_note_mentions")
    .update({ read_at: readAt })
    .eq("account_id", ctx.accountId)
    .eq("mentioned_user_id", ctx.userId)
    .is("read_at", null)
    .in("ticket_event_id", eventIds);

  if (error) return c.json({ error: error.message }, 500);

  // Non-fatal: the mention is already closed, the bell is a mirror of it.
  const { error: notifErr } = await supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("account_id", ctx.accountId)
    .eq("recipient_user_id", ctx.userId)
    .eq("kind", "mention")
    .is("read_at", null)
    .in("ticket_event_id", eventIds);

  if (notifErr) {
    console.error("[notes] mention notification read sync failed", { error: notifErr.message });
  }

  return c.json({ success: true });
});
