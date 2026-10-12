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

export interface ContractualSlaRule {
  id: string;
  ticket_type: string;
  plan_tier: string;
  response_hours: number;
  resolution_hours: number | null;
}

/**
 * The tenant_sla_rules row for a ticket type and a client plan.
 * clients.plan_type is capitalized ('Enterprise') and tenant_sla_rules.plan_tier
 * lowercase ('enterprise'): the plan always goes through normalizePlanTier.
 */
export function contractualSlaFor<T extends ContractualSlaRule>(rules: T[], ticketType: string | null | undefined, planType: string | null | undefined): T | null {
  const tier = normalizePlanTier(planType);
  return rules.find(rule => rule.ticket_type === ticketType && rule.plan_tier === tier) ?? null;
}
