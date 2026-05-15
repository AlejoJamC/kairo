import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";
import { requireRole } from "../../middleware/rbac.js";

export const invitations = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reads account_id from the x-account-id header (set by requireRole middleware). */
function getAccountId(c: { req: { header: (h: string) => string | undefined } }): string {
  return c.req.header("x-account-id") ?? "";
}

// ---------------------------------------------------------------------------
// POST /v1/invitations — create invitation
// Protected: owner or admin only
// ---------------------------------------------------------------------------

const CreateInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "supervisor", "agent"]), // owner is never assignable via invite
});

invitations.post("/", requireRole(["owner", "admin"]), async (c) => {
  const accountId = getAccountId(c);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateInvitationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ code: "VALIDATION_ERROR", issues: parsed.error.flatten() }, 400);
  }

  const { email, role } = parsed.data;

  // --- Seat limit check ---
  const { data: account } = await supabase
    .from("accounts")
    .select("seat_limit, name")
    .eq("id", accountId)
    .single();

  if (!account) return c.json({ code: "ACCOUNT_NOT_FOUND" }, 404);

  const { count: activeCount } = await supabase
    .from("account_members")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "active");

  const { count: pendingCount } = await supabase
    .from("account_invitations")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .gt("expires_at", new Date().toISOString());

  const occupied = (activeCount ?? 0) + (pendingCount ?? 0);
  if (occupied >= account.seat_limit) {
    return c.json({
      code: "SEAT_LIMIT_REACHED",
      message: `This account has reached its seat limit of ${account.seat_limit}.`,
    }, 422);
  }

  // --- Duplicate invitation check ---
  const { data: existing } = await supabase
    .from("account_invitations")
    .select("id, expires_at")
    .eq("account_id", accountId)
    .eq("email", email)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return c.json({
      code: "INVITATION_ALREADY_PENDING",
      message: `An active invitation for ${email} already exists. Cancel it first or wait for it to expire.`,
    }, 409);
  }

  // --- Check if email is already an active member ---
  const { data: alreadyMember } = await supabase
    .from("account_members")
    .select("id")
    .eq("account_id", accountId)
    .eq("status", "active")
    .in("user_id",
      supabase
        .from("profiles")
        .select("id")
        .eq("email", email) as any
    )
    .maybeSingle();

  if (alreadyMember) {
    return c.json({
      code: "ALREADY_A_MEMBER",
      message: `${email} is already an active member of this account.`,
    }, 409);
  }

  // --- Create invitation ---
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: inv, error } = await supabase
    .from("account_invitations")
    .insert({
      account_id: accountId,
      email,
      role,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, token")
    .single();

  if (error || !inv) {
    return c.json({ code: "CREATE_FAILED", detail: error?.message }, 500);
  }

  // Email sending is deferred (no transactional email provider configured yet).
  // The invite_link is returned for admins to share manually.
  const appUrl = process.env.APP_URL ?? "https://app.getkairo.ai";
  const inviteLink = `${appUrl}/invite?token=${inv.token}`;

  return c.json({
    invitation_id: inv.id,
    invite_link: inviteLink,
    email,
    role,
    expires_at: expiresAt.toISOString(),
    note: "Email delivery is not yet configured. Share the invite_link manually.",
  }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /v1/invitations/:id — cancel a pending invitation
// Protected: owner or admin only
// ---------------------------------------------------------------------------

invitations.delete("/:id", requireRole(["owner", "admin"]), async (c) => {
  const accountId = getAccountId(c);
  const id = c.req.param("id");

  const { error } = await supabase
    .from("account_invitations")
    .delete()
    .eq("id", id)
    .eq("account_id", accountId); // scoped to account — can't delete other accounts' invites

  if (error) return c.json({ code: "DELETE_FAILED", detail: error.message }, 500);

  return c.json({ success: true });
});
