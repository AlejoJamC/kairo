import { Hono } from "hono";
import { supabase } from "../../lib/supabase.js";

export const intelligence = new Hono();

const VALID_WINDOWS = new Set(["7d", "30d", "all"]);

// GET /v1/intelligence/classification-accuracy?window=30d
intelligence.get("/classification-accuracy", async (c) => {
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return c.json({ error: "Unauthorized" }, 401);

  const window = c.req.query("window") ?? "30d";
  if (!VALID_WINDOWS.has(window)) {
    return c.json({ error: "Invalid window. Use 7d, 30d, or all." }, 400);
  }

  const { data, error } = await supabase.rpc("get_classification_accuracy", {
    p_user_id: user.id,
    p_window:  window,
  });

  if (error) return c.json({ error: error.message }, 500);

  return c.json(data);
});
