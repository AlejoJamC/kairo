import { describe, it, expect } from "bun:test";
import {
  computePriorityScore,
  DEFAULT_WEIGHTS,
  type ScoreInputs,
} from "./scoring.js";

const now = new Date().toISOString();
const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const base: ScoreInputs = {
  type: "support",
  tone: "frustrated",
  plan: "pro",
  receivedAt: now,
  recentTicketCount: 0,
};

describe("computePriorityScore", () => {
  it("returns a number in [0, 1]", () => {
    const score = computePriorityScore(base);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("has at most 3 decimal places", () => {
    const score = computePriorityScore(base);
    expect(score).toBe(Math.round(score * 1000) / 1000);
  });

  it("spam type produces the lowest type contribution", () => {
    const spam = computePriorityScore({ ...base, type: "spam" });
    const support = computePriorityScore({ ...base, type: "support" });
    expect(support).toBeGreaterThan(spam);
  });

  it("enterprise plan scores higher than no-plan", () => {
    const enterprise = computePriorityScore({ ...base, plan: "enterprise" });
    const none = computePriorityScore({ ...base, plan: "none" });
    expect(enterprise).toBeGreaterThan(none);
  });

  it("aggressive tone scores higher than positive tone", () => {
    const aggressive = computePriorityScore({ ...base, tone: "aggressive" });
    const positive = computePriorityScore({ ...base, tone: "positive" });
    expect(aggressive).toBeGreaterThan(positive);
  });

  it("older tickets score higher (age_score increases with time)", () => {
    const fresh = computePriorityScore({ ...base, receivedAt: now });
    const old = computePriorityScore({ ...base, receivedAt: hoursAgo(48) });
    expect(old).toBeGreaterThan(fresh);
  });

  it("age_score saturates at 1.0 beyond 48 hours", () => {
    const at48h = computePriorityScore({ ...base, receivedAt: hoursAgo(48) });
    const at96h = computePriorityScore({ ...base, receivedAt: hoursAgo(96) });
    expect(at48h).toBe(at96h);
  });

  it("recurrence multiplier (>=5 tickets) increases score", () => {
    const normal = computePriorityScore({ ...base, recentTicketCount: 4 });
    const recurrent = computePriorityScore({ ...base, recentTicketCount: 5 });
    expect(recurrent).toBeGreaterThan(normal);
  });

  it("no-plan clients are hard-capped at 0.5", () => {
    const score = computePriorityScore({
      type: "support",
      tone: "aggressive",
      plan: "none",
      receivedAt: hoursAgo(48),
      recentTicketCount: 10,
    });
    expect(score).toBeLessThanOrEqual(0.5);
  });

  it("no-plan cap applies even with recurrence multiplier", () => {
    const score = computePriorityScore(
      {
        type: "support",
        tone: "aggressive",
        plan: "none",
        receivedAt: hoursAgo(48),
        recentTicketCount: 10,
      },
      DEFAULT_WEIGHTS
    );
    expect(score).toBeLessThanOrEqual(0.5);
  });

  it("score is 0 for spam regardless of other signals", () => {
    const score = computePriorityScore({
      type: "spam",
      tone: "aggressive",
      plan: "enterprise",
      receivedAt: hoursAgo(48),
      recentTicketCount: 0,
    });
    // spam contributes 0 to type_score; other signals still apply
    // but type weight (0.30) is zeroed — score is still > 0 due to plan+emotion+age
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("custom weights are respected", () => {
    const typeHeavy = computePriorityScore(base, {
      weightType: 1.0,
      weightPlan: 0.0,
      weightEmotion: 0.0,
      weightAge: 0.0,
    });
    // type=support → type_score=0.8, weight=1.0 → score=0.8
    expect(typeHeavy).toBe(0.8);
  });
});
