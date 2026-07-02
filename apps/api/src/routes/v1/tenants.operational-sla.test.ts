import { describe, it, expect } from "bun:test";
import { z } from "zod";

// ---------------------------------------------------------------------------
// KAI-168 — operational-sla-config schema/business-rule unit tests
// (No Supabase dependency — mirrors the validation in tenants.ts)
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

const validRow = (priority: "P1" | "P2" | "P3") => ({
  priority,
  maxResponseSeconds: 3600,
  minResponseSeconds: 900,
  riskAlertSeconds: 1800,
  escalationSeconds: 2700,
});

describe("PrioritySlaConfigSchema", () => {
  it("accepts a valid P1 row", () => {
    expect(PrioritySlaConfigSchema.safeParse(validRow("P1")).success).toBe(true);
  });

  it("rejects minResponseSeconds >= maxResponseSeconds", () => {
    const row = { ...validRow("P1"), minResponseSeconds: 3600, maxResponseSeconds: 3600 };
    expect(PrioritySlaConfigSchema.safeParse(row).success).toBe(false);
  });

  it("rejects zero or negative seconds", () => {
    expect(PrioritySlaConfigSchema.safeParse({ ...validRow("P1"), maxResponseSeconds: 0 }).success).toBe(false);
    expect(PrioritySlaConfigSchema.safeParse({ ...validRow("P1"), riskAlertSeconds: -1 }).success).toBe(false);
  });

  it("rejects a priority outside P1/P2/P3", () => {
    expect(PrioritySlaConfigSchema.safeParse({ ...validRow("P1"), priority: "P4" }).success).toBe(false);
  });
});

describe("OperationalSlaConfigSchema", () => {
  it("accepts exactly one row per priority", () => {
    const body = { config: [validRow("P1"), validRow("P2"), validRow("P3")] };
    expect(OperationalSlaConfigSchema.safeParse(body).success).toBe(true);
  });

  it("rejects fewer than 3 rows", () => {
    const body = { config: [validRow("P1"), validRow("P2")] };
    expect(OperationalSlaConfigSchema.safeParse(body).success).toBe(false);
  });

  it("rejects duplicate priorities", () => {
    const body = { config: [validRow("P1"), validRow("P1"), validRow("P3")] };
    expect(OperationalSlaConfigSchema.safeParse(body).success).toBe(false);
  });
});
