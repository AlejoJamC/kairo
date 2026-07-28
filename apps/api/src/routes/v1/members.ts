import { Hono } from "hono";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";

export const members = new Hono();

// ---------------------------------------------------------------------------
// GET /v1/members — active members of the caller's account (KAI-232 / ADR-025 §6)
//
// The browser cannot resolve teammate names on its own: `profiles` RLS is
// self-scoped and `account_members` carries no names. This endpoint is the
// source for the @mention dropdown in the internal-note composer.
//
// No pagination and no server-side typeahead: support teams are small, so the
// client fetches the list once and filters it locally.
// ---------------------------------------------------------------------------

interface AccountMemberRow {
  user_id: string;
  role: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
}

members.get("/", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const { data: memberRows, error: membersErr } = await supabase
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", ctx.accountId)
    .eq("status", "active");

  if (membersErr) return c.json({ error: membersErr.message }, 500);

  const rows = (memberRows ?? []) as AccountMemberRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];

  if (userIds.length === 0) return c.json({ data: [] });

  // Second query: there is no PostgREST relationship between account_members
  // and profiles, so names are resolved by id (same pattern as tickets.ts).
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", userIds);

  if (profilesErr) return c.json({ error: profilesErr.message }, 500);

  const profileMap = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  const data = rows
    .map((row) => {
      const profile = profileMap.get(row.user_id);
      return {
        user_id: row.user_id,
        name: profile?.name ?? null,
        email: profile?.email ?? null,
        role: row.role,
      };
    })
    .sort((a, b) =>
      (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", undefined, {
        sensitivity: "base",
      }),
    );

  return c.json({ data });
});
