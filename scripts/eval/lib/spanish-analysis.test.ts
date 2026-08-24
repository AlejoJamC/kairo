import { describe, it, expect } from "bun:test";
import { computeDifficultyBreakdown, computeToneInflation } from "./spanish-analysis";
import type { AnalysisRow } from "./spanish-analysis";

function row(over: Partial<AnalysisRow>): AnalysisRow {
  return {
    gtTone: "neutral",
    gtPriority: "P2",
    predictedPriority: "P2",
    gtDifficulty: "easy",
    gtTicketType: "support",
    predictedTicketType: "support",
    ...over,
  };
}

describe("computeDifficultyBreakdown", () => {
  it("carries a baseline per subset, since each has its own majority class", () => {
    const rows = [
      row({ gtDifficulty: "easy", gtTicketType: "support", predictedTicketType: "support" }),
      row({ gtDifficulty: "easy", gtTicketType: "support", predictedTicketType: "support" }),
      row({ gtDifficulty: "easy", gtTicketType: "internal", predictedTicketType: "support" }),
      row({ gtDifficulty: "hard", gtTicketType: "internal", predictedTicketType: "internal" }),
    ];

    const b = computeDifficultyBreakdown(rows);

    expect(b.easy.count).toBe(3);
    expect(b.hard.count).toBe(1);
    // The easy run answered `support` to everything — exactly the baseline
    expect(b.easy.ticket_type_f1).toBeCloseTo(b.easy.ticket_type_baseline_f1, 5);
    // The hard subset has a single class, so its baseline is trivially perfect
    expect(b.hard.ticket_type_baseline_f1).toBe(1);
  });

  it("beats its baseline when the run actually separates the classes", () => {
    const rows = [
      row({ gtTicketType: "support", predictedTicketType: "support" }),
      row({ gtTicketType: "support", predictedTicketType: "support" }),
      row({ gtTicketType: "internal", predictedTicketType: "internal" }),
    ];

    const b = computeDifficultyBreakdown(rows);

    expect(b.easy.ticket_type_f1).toBeGreaterThan(b.easy.ticket_type_baseline_f1);
  });

  it("reports zeros for a level with no emails", () => {
    const b = computeDifficultyBreakdown([row({ gtDifficulty: "easy" })]);

    expect(b.ambiguous.count).toBe(0);
    expect(b.ambiguous.ticket_type_f1).toBe(0);
    expect(b.ambiguous.ticket_type_baseline_f1).toBe(0);
  });
});

describe("computeToneInflation", () => {
  it("counts only hot-tone emails pushed to a higher priority", () => {
    const rows = [
      row({ gtTone: "frustrated", gtPriority: "P2", predictedPriority: "P1" }), // inflated
      row({ gtTone: "aggressive", gtPriority: "P3", predictedPriority: "P3" }), // exact
      row({ gtTone: "neutral", gtPriority: "P3", predictedPriority: "P1" }),    // not hot
    ];

    const t = computeToneInflation(rows);

    expect(t.aggressive_or_frustrated_emails).toBe(2);
    expect(t.emails_with_inflated_priority).toBe(1);
    expect(t.tone_inflation_rate).toBeCloseTo(0.5, 5);
  });

  it("does not count deflation as inflation", () => {
    const t = computeToneInflation([
      row({ gtTone: "frustrated", gtPriority: "P1", predictedPriority: "P3" }),
    ]);

    expect(t.emails_with_inflated_priority).toBe(0);
  });

  it("returns a zero rate when no email carries a hot tone", () => {
    const t = computeToneInflation([row({ gtTone: "neutral" })]);

    expect(t.aggressive_or_frustrated_emails).toBe(0);
    expect(t.tone_inflation_rate).toBe(0);
  });
});
