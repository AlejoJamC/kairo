import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";
import { DEFAULT_WEIGHTS, type TenantWeights } from "../../lib/scoring.js";

export const tenants = new Hono();

// ---------------------------------------------------------------------------
// GET /v1/tenants/priority-config
// ---------------------------------------------------------------------------

tenants.get("/priority-config", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const { data } = await supabase
    .from("tenant_priority_config")
    .select("weight_type, weight_plan, weight_emotion, weight_age, updated_at")
    .eq("account_id", ctx.accountId)
    .maybeSingle();

  if (!data) {
    return c.json({ ...DEFAULT_WEIGHTS, is_default: true });
  }

  return c.json({
    weightType: data.weight_type,
    weightPlan: data.weight_plan,
    weightEmotion: data.weight_emotion,
    weightAge: data.weight_age,
    updated_at: data.updated_at,
    is_default: false,
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/tenants/priority-config
// ---------------------------------------------------------------------------

const WeightsSchema = z.object({
  weightType:    z.number().min(0).max(1),
  weightPlan:    z.number().min(0).max(1),
  weightEmotion: z.number().min(0).max(1),
  weightAge:     z.number().min(0).max(1),
}).refine(
  (w) => Math.abs(w.weightType + w.weightPlan + w.weightEmotion + w.weightAge - 1) < 0.01,
  { message: "Weights must sum to 1.0 (±0.01)" }
);

tenants.put("/priority-config", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = WeightsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid weights", detail: parsed.error.flatten() }, 400);
  }

  const weights: TenantWeights = parsed.data;

  const { error } = await supabase
    .from("tenant_priority_config")
    .upsert(
      {
        account_id:    ctx.accountId,
        weight_type:   weights.weightType,
        weight_plan:   weights.weightPlan,
        weight_emotion: weights.weightEmotion,
        weight_age:    weights.weightAge,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

  if (error) {
    return c.json({ error: "Failed to save config", detail: error.message }, 500);
  }

  return c.json({ ...weights, updated_at: new Date().toISOString() });
});
