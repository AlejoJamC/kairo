import { describe, it, expect } from "bun:test";
import { BENCH, ONBOARDING_BENCH, VARIANTS, bodyRule, cellKey, cellSlug, totalCells, variantsFor } from "./matrix";
import type { PipelineStage } from "./run-label";

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
  // tenantMailbox is not a variable: production sends it from every ingestion
  // path, so every variant sends it too. The only thing that varies is the
  // stage, and — on backfill alone — the tenant's line of business.
  it("measures each stage once", () => {
    expect(VARIANTS.map((v) => v.id)).toEqual(["onboarding", "backfill"]);
  });

  // The paired cell would measure a combination production cannot execute:
  // resolveClassifierContext does not read the column on `onboarding`.
  it("never pairs the onboarding stage with a business context", () => {
    const onboarding = VARIANTS.filter((v) => v.stage === "onboarding");
    expect(onboarding).toHaveLength(1);
    expect(onboarding[0]!.businessContext).toBe(false);
  });

  // Both business-context questions are answered and enforced in
  // classifier-input.ts. A variant may only carry the context on the stage
  // production sends it on, or the bench measures something nobody can ship.
  it("carries the business context on backfill and never on onboarding", () => {
    for (const v of VARIANTS) {
      expect(v.businessContext).toBe(v.stage === "backfill");
    }
  });

  it("states why every cell exists", () => {
    for (const v of VARIANTS) expect(v.question.length).toBeGreaterThan(30);
  });

  it("mirrors the production body rule for each stage", () => {
    expect(bodyRule(VARIANTS[0]!)).toEqual({ maxChars: 20_000, stripQuotes: false });
    expect(bodyRule(VARIANTS[1]!)).toEqual({ maxChars: 2_000, stripQuotes: true });
  });
});

// ---------------------------------------------------------------------------
// Tier 1 and backfill are not the same experiment. Onboarding decides on
// accuracy against the latency of one call, so it only measures models that
// already cleared the accuracy bar; backfill has no user waiting and measures
// everything. These freeze that split.
// ---------------------------------------------------------------------------

describe("ONBOARDING_BENCH", () => {
  it("is the three models that cleared 0.80 on the previous matrix", () => {
    expect(ONBOARDING_BENCH.map((m) => m.model).sort()).toEqual([
      "claude-sonnet-4-6",
      "granite4.2:30b",
      "qwen3.8:latest",
    ]);
  });

  it("is a subset of the full bench, not a separate list", () => {
    for (const m of ONBOARDING_BENCH) expect(BENCH).toContain(m);
    expect(ONBOARDING_BENCH.length).toBeLessThan(BENCH.length);
  });
});

describe("variantsFor", () => {
  const byModel = (model: string) => BENCH.find((m) => m.model === model)!;

  it("runs Claude on onboarding and nothing else", () => {
    expect(variantsFor(byModel("claude-sonnet-4-6")).map((v) => v.id)).toEqual([
      "onboarding",
    ]);
  });

  it("runs a both-stages model on both cells", () => {
    for (const model of ["qwen3.8:latest", "granite4.2:30b"]) {
      expect(variantsFor(byModel(model)).map((v) => v.id)).toEqual([
        "onboarding",
        "backfill",
      ]);
    }
  });

  it("runs a backfill-only model on the backfill cell alone", () => {
    for (const model of ["muse-glimmer:30b", "gemma4:31b"]) {
      expect(variantsFor(byModel(model)).map((v) => v.id)).toEqual(["backfill"]);
    }
  });

  // The rule, rather than the current roster: a cell may only exist for a
  // stage its model declares, and no model may end up with nothing to run.
  it("never measures a stage the model does not declare", () => {
    for (const m of BENCH) {
      expect(variantsFor(m).length).toBeGreaterThan(0);
      for (const v of variantsFor(m)) expect(m.stages).toContain(v.stage);
    }
  });
});

describe("totalCells", () => {
  it("counts the cells that will actually run, not models x variants", () => {
    const naive = BENCH.length * VARIANTS.length * 50;
    const real = BENCH.reduce((n, m) => n + variantsFor(m).length, 0) * 50;

    expect(totalCells(50)).toBe(real);
    expect(totalCells(50)).toBeLessThan(naive);
  });
});

describe("cellSlug", () => {
  const granite = {
    provider: "ollama" as const,
    model: "granite4.2:30b",
    label: "g",
    stages: ["onboarding", "backfill"] as PipelineStage[],
  };

  it("gives every variant of a model its own directory", () => {
    const slugs = VARIANTS.map((v) => cellSlug(granite, v));

    expect(slugs).toEqual([
      "ollama-granite4.2-30b-onboarding",
      "ollama-granite4.2-30b",
    ]);
    expect(new Set(slugs).size).toBe(VARIANTS.length);
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

    // Uniqueness is the property, not the count: pinning the number here made
    // the test fail when a variant was retired, which is not a defect.
    expect(new Set(keys).size).toBe(VARIANTS.length);
    expect(keys[0]).toBe("anthropic/claude-sonnet-4-6|onboarding|007");
  });

  it("separates the same variant on different emails", () => {
    const m = BENCH[0]!;

    expect(cellKey(m, VARIANTS[0]!, "007")).not.toBe(cellKey(m, VARIANTS[0]!, "008"));
  });
});
