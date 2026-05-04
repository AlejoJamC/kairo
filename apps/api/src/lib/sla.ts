import type { PlanTier } from "./scoring.js";

/**
 * Computes the SLA deadline given a received timestamp and the
 * number of response hours defined in tenant_sla_rules.
 */
export function computeSlaDeadline(receivedAt: string, responseHours: number): string {
  const ms = new Date(receivedAt).getTime() + responseHours * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

/**
 * Maps clients.plan_type (capitalized, nullable) to the canonical PlanTier
 * used by the scoring engine.
 */
export function normalizePlanTier(planType: string | null | undefined): PlanTier {
  if (!planType) return "none";
  const lower = planType.toLowerCase();
  if (lower === "enterprise" || lower === "pro" || lower === "starter") return lower;
  return "none";
}
