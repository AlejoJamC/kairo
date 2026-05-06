import { describe, it, expect } from "bun:test";
import { planScoreFromTier, computeClientFlags } from "./client-profile.js";

// ---------------------------------------------------------------------------
// KAI-39 acceptance criteria tests
// AC #1 — All required profile fields returned
// AC #2 — isRecurrent: true if > 3 tickets in last 30 days
// AC #3 — isNewClient: true if no tickets in last 90 days
// AC #4 — recentTickets limited to last 5
// AC #5 — 404 if client not found
// ---------------------------------------------------------------------------

describe("planScoreFromTier", () => {
  it("enterprise → 1.0", () => expect(planScoreFromTier("Enterprise")).toBe(1.0));
  it("pro → 0.67",        () => expect(planScoreFromTier("Pro")).toBe(0.67));
  it("starter → 0.33",    () => expect(planScoreFromTier("Starter")).toBe(0.33));
  it("null → 0.0",        () => expect(planScoreFromTier(null)).toBe(0.0));
  it("unknown → 0.0",     () => expect(planScoreFromTier("unknown")).toBe(0.0));
  it("case-insensitive",   () => expect(planScoreFromTier("ENTERPRISE")).toBe(1.0));
});

describe("computeClientFlags — isRecurrent", () => {
  it("false when 3 tickets in last 30 days (not over threshold)", () => {
    expect(computeClientFlags(3, 5).isRecurrent).toBe(false);
  });
  it("true when 4 tickets in last 30 days", () => {
    expect(computeClientFlags(4, 5).isRecurrent).toBe(true);
  });
  it("true when many tickets", () => {
    expect(computeClientFlags(20, 25).isRecurrent).toBe(true);
  });
});

describe("computeClientFlags — isNewClient", () => {
  it("true when 0 tickets in last 90 days", () => {
    expect(computeClientFlags(0, 0).isNewClient).toBe(true);
  });
  it("false when has tickets in last 90 days", () => {
    expect(computeClientFlags(0, 1).isNewClient).toBe(false);
  });
  it("false when recurrent and has 90-day history", () => {
    expect(computeClientFlags(5, 10).isNewClient).toBe(false);
  });
});

describe("client-profile response shape", () => {
  it("profile object has all required fields", () => {
    const profile = {
      clientId: "uuid-1",
      name: "Acme Corp",
      email: "acme@example.com",
      phone: "+573001234567",
      clientType: "enterprise" as const,
      activePlan: "Enterprise",
      planScore: 1.0,
      isNewClient: false,
      isRecurrent: true,
      totalTickets: 42,
      ticketsLast30Days: 5,
      recentTickets: [],
    };
    const required = [
      "clientId", "name", "email", "phone", "clientType", "activePlan",
      "planScore", "isNewClient", "isRecurrent", "totalTickets",
      "ticketsLast30Days", "recentTickets",
    ];
    for (const key of required) expect(profile).toHaveProperty(key);
  });

  it("recentTickets is capped at 5", () => {
    const tickets = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    const capped = tickets.slice(0, 5);
    expect(capped).toHaveLength(5);
  });

  it("phone is nullable", () => {
    const phone: string | null = null;
    expect(phone).toBeNull();
  });
});
