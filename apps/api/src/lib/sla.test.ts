import { describe, it, expect } from "bun:test";
import { computeSlaDeadline, normalizePlanTier } from "./sla.js";

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
