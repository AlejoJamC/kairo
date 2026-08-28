import { describe, it, expect } from "bun:test";
import { BENCH, VARIANTS, cellSlug, bodyRule, cellKey } from "./matrix";

describe("BENCH", () => {
  // A model that does not beat the majority-class baseline carries no
  // information about the email it read, so it is not a candidate at any speed
  it("excludes the models that did not clear the baseline", () => {
    const ids = BENCH.map((m) => m.model);

    expect(ids).not.toContain("claude-haiku-4-5-20251001");
    expect(ids).not.toContain("mistral-small3.2:24b");
  });

  it("runs the fastest model first so a misconfiguration fails in minutes", () => {
    expect(BENCH[0]?.provider).toBe("anthropic");
    expect(BENCH[0]?.model).toBe("claude-sonnet-4-6");
  });

  it("names each model once", () => {
    expect(new Set(BENCH.map((m) => m.model)).size).toBe(BENCH.length);
  });
});

describe("VARIANTS", () => {
  // tenantMailbox is not a variable: production sends it from all four
  // ingestion paths, so every variant sends it too. Only stage and the
  // tenant's line of business vary.
  it("covers both stages with and without businessContext", () => {
    expect(VARIANTS.map((v) => v.id)).toEqual([
      "onboarding",
      "onboarding-bc",
      "backfill",
      "backfill-bc",
    ]);
  });

  it("pairs each stage baseline with its businessContext counterpart", () => {
    for (const stage of ["onboarding", "backfill"] as const) {
      const pair = VARIANTS.filter((v) => v.stage === stage);
      expect(pair).toHaveLength(2);
      expect(pair.map((v) => v.businessContext).sort()).toEqual([false, true]);
    }
  });

  it("states why every cell exists", () => {
    for (const v of VARIANTS) expect(v.question.length).toBeGreaterThan(30);
  });

  it("mirrors the production body rule for each stage", () => {
    expect(bodyRule(VARIANTS[0]!)).toEqual({ maxChars: 20_000, stripQuotes: false });
    expect(bodyRule(VARIANTS[2]!)).toEqual({ maxChars: 2_000, stripQuotes: true });
  });
});

describe("cellSlug", () => {
  const granite = { provider: "ollama" as const, model: "granite4.2:30b", label: "g" };

  it("gives every variant of a model its own directory", () => {
    const slugs = VARIANTS.map((v) => cellSlug(granite, v));

    expect(slugs).toEqual([
      "ollama-granite4.2-30b-onboarding",
      "ollama-granite4.2-30b-onboarding-bc",
      "ollama-granite4.2-30b",
      "ollama-granite4.2-30b-bc",
    ]);
    expect(new Set(slugs).size).toBe(4);
  });

  it("never collides across the whole bench", () => {
    const all = BENCH.flatMap((m) => VARIANTS.map((v) => cellSlug(m, v)));

    expect(new Set(all).size).toBe(BENCH.length * VARIANTS.length);
  });
});

describe("cellKey", () => {
  it("identifies one classification uniquely", () => {
    const m = BENCH[0]!;
    const keys = VARIANTS.map((v) => cellKey(m, v, "007"));

    expect(new Set(keys).size).toBe(4);
    expect(keys[0]).toBe("anthropic/claude-sonnet-4-6|onboarding|007");
  });

  it("separates the same variant on different emails", () => {
    const m = BENCH[0]!;

    expect(cellKey(m, VARIANTS[0]!, "007")).not.toBe(cellKey(m, VARIANTS[0]!, "008"));
  });
});
