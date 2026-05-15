import { Hono } from "hono";
import { supabase } from "../../lib/supabase.js";
import { requireRole } from "../../middleware/rbac.js";

export const channels = new Hono();

// ---------------------------------------------------------------------------
// GET /v1/accounts/:accountId/channels
// All active members can list channels.
// ---------------------------------------------------------------------------
channels.get("/:accountId/channels", requireRole(["owner", "admin", "supervisor", "agent"]), async (c) => {
  const accountId = c.req.param("accountId");
  const headerAccountId = c.req.header("x-account-id");

  // Ensure the requested accountId matches the authenticated account context.
  if (accountId !== headerAccountId) {
    return c.json({ code: "FORBIDDEN" }, 403);
  }

  const { data, error } = await supabase
    .from("support_channels")
    .select("id, channel_type, email_address, display_name, is_primary, is_active, connected_at, created_at")
    .eq("account_id", accountId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return c.json({ code: "FETCH_FAILED", detail: error.message }, 500);

  return c.json({ channels: data ?? [] });
});

// ---------------------------------------------------------------------------
// POST /v1/accounts/:accountId/channels
// Register a channel that was already OAuth-connected (tokens stored separately
// by the OAuth callback). Owners and admins only.
//
// Body: { channel_type, email_address, display_name?, is_primary? }
// ---------------------------------------------------------------------------
channels.post("/:accountId/channels", requireRole(["owner", "admin"]), async (c) => {
  const accountId = c.req.param("accountId");
  const headerAccountId = c.req.header("x-account-id");

  if (accountId !== headerAccountId) {
    return c.json({ code: "FORBIDDEN" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body?.email_address || !body?.channel_type) {
    return c.json({ code: "VALIDATION_ERROR", message: "email_address and channel_type are required" }, 400);
  }

  const { channel_type, email_address, display_name, is_primary } = body;

  const validTypes = ["gmail", "outlook", "imap", "custom"];
  if (!validTypes.includes(channel_type)) {
    return c.json({ code: "INVALID_CHANNEL_TYPE", valid: validTypes }, 400);
  }

  // If setting as primary, clear existing primary first.
  if (is_primary) {
    await supabase
      .from("support_channels")
      .update({ is_primary: false })
      .eq("account_id", accountId);
  }

  const { data, error } = await supabase
    .from("support_channels")
    .upsert({
      account_id:    accountId,
      channel_type,
      email_address,
      display_name:  display_name ?? null,
      is_primary:    is_primary ?? false,
      is_active:     true,
    }, { onConflict: "account_id,email_address" })
    .select("id, channel_type, email_address, display_name, is_primary, is_active")
    .single();

  if (error) return c.json({ code: "UPSERT_FAILED", detail: error.message }, 500);

  return c.json(data, 201);
});

// ---------------------------------------------------------------------------
// DELETE /v1/accounts/:accountId/channels/:channelId
// Soft-delete: sets is_active = false. Owners and admins only.
// Hard-delete is intentionally not exposed — tokens should be revoked first.
// ---------------------------------------------------------------------------
channels.delete("/:accountId/channels/:channelId", requireRole(["owner", "admin"]), async (c) => {
  const accountId  = c.req.param("accountId");
  const channelId  = c.req.param("channelId");
  const headerAccountId = c.req.header("x-account-id");

  if (accountId !== headerAccountId) {
    return c.json({ code: "FORBIDDEN" }, 403);
  }

  const { error } = await supabase
    .from("support_channels")
    .update({ is_active: false })
    .eq("id", channelId)
    .eq("account_id", accountId); // scoped — can't touch other accounts

  if (error) return c.json({ code: "UPDATE_FAILED", detail: error.message }, 500);

  return c.json({ success: true });
});
