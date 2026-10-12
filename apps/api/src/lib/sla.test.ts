import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSlaDeadline, contractualSlaFor, normalizePlanTier } from "./sla.js";

describe("computeSlaDeadline", () => {
  it("adds response_hours to receivedAt correctly", () => {
    const receivedAt = "2026-05-04T10:00:00.000Z";
    const result = computeSlaDeadline(receivedAt, 4);
    expect(result).toBe("2026-05-04T14:00:00.000Z");
  });

  it("handles 24-hour SLA", () => {
    const receivedAt = "2026-05-04T10:00:00.000Z";
    const result = computeSlaDeadline(receivedAt, 24);
    expect(result).toBe("2026-05-05T10:00:00.000Z");
  });

  it("returns a valid ISO string", () => {
    const result = computeSlaDeadline(new Date().toISOString(), 8);
    expect(() => new Date(result)).not.toThrow();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("normalizePlanTier", () => {
  it("maps null to none", () => expect(normalizePlanTier(null)).toBe("none"));
  it("maps undefined to none", () => expect(normalizePlanTier(undefined)).toBe("none"));
  it("maps Enterprise to enterprise", () => expect(normalizePlanTier("Enterprise")).toBe("enterprise"));
  it("maps Pro to pro", () => expect(normalizePlanTier("Pro")).toBe("pro"));
  it("maps Starter to starter", () => expect(normalizePlanTier("Starter")).toBe("starter"));
  it("maps unknown value to none", () => expect(normalizePlanTier("Gold")).toBe("none"));
});

/** Values a CHECK constraint allows for one column, read from the schema snapshot. */
function allowedValues(table: string, column: string): string[] {
  const schema = readFileSync(join(import.meta.dir, "../../../../supabase/schema.sql"), "utf8");
  const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}"`);
  const definition = schema.slice(start, schema.indexOf("\n);", start));
  const check = definition.split("\n").find(line => line.includes("CHECK") && line.includes(`"${column}" = ANY`));
  if (!check) throw new Error(`No CHECK constraint for ${table}.${column}`);
  return [...check.matchAll(/'([^']+)'::"text"/g)].map(match => match[1]!);
}

describe("clients.plan_type and tenant_sla_rules.plan_tier stay comparable", () => {
  // The two columns use different spellings ('Enterprise' vs 'enterprise').
  // Comparing them directly silently never matches; every allowed plan_type
  // must land on an allowed plan_tier through normalizePlanTier.
  it("maps every allowed plan_type, and a missing plan, to an allowed plan_tier", () => {
    const planTypes = allowedValues("clients", "plan_type");
    const planTiers = allowedValues("tenant_sla_rules", "plan_tier");
    expect(planTypes.length).toBeGreaterThan(0);
    for (const planType of [...planTypes, null]) {
      expect(planTiers).toContain(normalizePlanTier(planType));
    }
  });
});

describe("contractualSlaFor", () => {
  const rules = ["enterprise", "pro", "starter", "none"].map(tier => ({
    id: tier, ticket_type: "support", plan_tier: tier, response_hours: 1, resolution_hours: null,
  }));

  it("finds the contract for every capitalized plan_type the directory stores", () => {
    expect(contractualSlaFor(rules, "support", "Enterprise")?.id).toBe("enterprise");
    expect(contractualSlaFor(rules, "support", "Pro")?.id).toBe("pro");
    expect(contractualSlaFor(rules, "support", "Starter")?.id).toBe("starter");
  });

  it("uses the 'none' tier for a client without a plan or an unknown sender", () => {
    expect(contractualSlaFor(rules, "support", null)?.id).toBe("none");
  });

  it("returns null when the ticket type has no contract", () => {
    expect(contractualSlaFor(rules, "prospect", "Pro")).toBeNull();
  });
});
