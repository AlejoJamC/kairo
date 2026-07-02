import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";
import { DEFAULT_WEIGHTS, type TenantWeights } from "../../lib/scoring.js";
import { DEFAULT_PRIORITY_SLA_SECONDS, type TicketPriority } from "../../lib/operational-sla.js";

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

// ---------------------------------------------------------------------------
// GET /v1/tenants/operational-sla-config
// KAI-168 — operational SLA by ticket priority (separate domain from the
// tenant/plan-tier contractual SLA in tenant_sla_rules).
// ---------------------------------------------------------------------------

const PRIORITIES: TicketPriority[] = ["P1", "P2", "P3"];

interface OperationalSlaConfigRow {
  priority: TicketPriority;
  maxResponseSeconds: number;
  minResponseSeconds: number;
  riskAlertSeconds: number;
  escalationSeconds: number;
  is_default: boolean;
}

tenants.get("/operational-sla-config", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const { data } = await supabase
    .from("ticket_priority_sla_config")
    .select("priority, max_response_seconds, min_response_seconds, risk_alert_seconds, escalation_seconds")
    .eq("account_id", ctx.accountId);

  const byPriority = new Map((data ?? []).map((row) => [row.priority as TicketPriority, row]));

  const config: OperationalSlaConfigRow[] = PRIORITIES.map((priority) => {
    const row = byPriority.get(priority);
    if (!row) {
      const defaults = DEFAULT_PRIORITY_SLA_SECONDS[priority];
      return { priority, ...defaults, is_default: true };
    }
    return {
      priority,
      maxResponseSeconds: row.max_response_seconds,
      minResponseSeconds: row.min_response_seconds,
      riskAlertSeconds: row.risk_alert_seconds,
      escalationSeconds: row.escalation_seconds,
      is_default: false,
    };
  });

  return c.json({ config });
});

// ---------------------------------------------------------------------------
// PUT /v1/tenants/operational-sla-config
// ---------------------------------------------------------------------------

const PrioritySlaConfigSchema = z
  .object({
    priority: z.enum(["P1", "P2", "P3"]),
    maxResponseSeconds: z.number().int().positive(),
    minResponseSeconds: z.number().int().positive(),
    riskAlertSeconds: z.number().int().positive(),
    escalationSeconds: z.number().int().positive(),
  })
  .refine((row) => row.minResponseSeconds < row.maxResponseSeconds, {
    message: "minResponseSeconds must be less than maxResponseSeconds",
  });

const OperationalSlaConfigSchema = z
  .object({ config: z.array(PrioritySlaConfigSchema).length(3) })
  .refine((body) => new Set(body.config.map((row) => row.priority)).size === 3, {
    message: "config must include exactly one row per priority (P1, P2, P3)",
  });

tenants.put("/operational-sla-config", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = OperationalSlaConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid operational SLA config", detail: parsed.error.flatten() }, 400);
  }

  const now = new Date().toISOString();
  const rows = parsed.data.config.map((row: z.infer<typeof PrioritySlaConfigSchema>) => ({
    account_id: ctx.accountId,
    priority: row.priority,
    max_response_seconds: row.maxResponseSeconds,
    min_response_seconds: row.minResponseSeconds,
    risk_alert_seconds: row.riskAlertSeconds,
    escalation_seconds: row.escalationSeconds,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("ticket_priority_sla_config")
    .upsert(rows, { onConflict: "account_id,priority" });

  if (error) {
    return c.json({ error: "Failed to save operational SLA config", detail: error.message }, 500);
  }

  return c.json({ config: parsed.data.config, updated_at: now });
});
