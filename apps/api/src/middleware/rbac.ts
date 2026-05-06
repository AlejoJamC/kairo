import type { MiddlewareHandler } from "hono";
import { supabase } from "../lib/supabase.js";

export type DashboardRole = "owner" | "admin" | "supervisor" | "agent";

export function requireRole(allowedRoles: DashboardRole[]): MiddlewareHandler {
  return async (c, next) => {
    const token = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return c.json({ code: "UNAUTHORIZED" }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return c.json({ code: "UNAUTHORIZED" }, 401);

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = roleRow?.role as DashboardRole | undefined;
    if (!role || !allowedRoles.includes(role)) {
      return c.json({ code: "INSUFFICIENT_ROLE" }, 403);
    }

    await next();
  };
}
