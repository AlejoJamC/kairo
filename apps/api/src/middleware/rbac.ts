import type { MiddlewareHandler } from "hono";
import { supabase } from "../lib/supabase.js";
import { isRoleAllowed, type DashboardRole } from "./rbac-check.js";

export type { DashboardRole };
export { isRoleAllowed };

export function requireRole(allowedRoles: DashboardRole[]): MiddlewareHandler {
  return async (c, next) => {
    const token = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return c.json({ code: "UNAUTHORIZED" }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return c.json({ code: "UNAUTHORIZED" }, 401);

    const accountId = c.req.header("x-account-id");
    if (!accountId) return c.json({ code: "MISSING_ACCOUNT_CONTEXT" }, 400);

    const { data: member } = await supabase
      .from("account_members")
      .select("role, status")
      .eq("user_id", user.id)
      .eq("account_id", accountId)
      .maybeSingle();

    if (!isRoleAllowed(member, allowedRoles)) {
      return c.json({ code: "INSUFFICIENT_ROLE" }, 403);
    }

    await next();
  };
}
