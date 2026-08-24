import { describe, it, expect } from "bun:test";
import { computeFieldMetrics, computeBaseline } from "./metrics";

// ---------------------------------------------------------------------------
// KAI-93: the macro average must ignore classes the ground truth never uses.
// Averaging them in caps the score below any useful threshold before a single
// correct answer is counted, which is how the eval became unable to emit a GO
// for any model. These tests freeze that behaviour.
// ---------------------------------------------------------------------------

describe("computeFieldMetrics — off-rubric classes", () => {
  it("averages over ground-truth classes only", () => {
    // 2 real classes, model emits a third the truth never contains
    const truths = ["support", "support", "support", "internal"];
    const predictions = ["support", "support", "prospect", "internal"];

    const m = computeFieldMetrics(truths, predictions);

    // support: tp 2, fp 0, fn 1 → p 1.00, r 0.67, f1 0.80
    // internal: perfect → f1 1.00
    // prospect: support 0 → excluded from the macro
    expect(m.macro_f1).toBeCloseTo((0.8 + 1) / 2, 5);
  });

  it("does not let a stray class cap the macro", () => {
    const truths = ["a", "a", "b", "b"];
    const perfect = ["a", "a", "b", "b"];
    const oneStray = ["a", "a", "b", "z"];

    expect(computeFieldMetrics(truths, perfect).macro_f1).toBe(1);
    // Under the old union-based average this could not exceed 2/3
    expect(computeFieldMetrics(truths, oneStray).macro_f1).toBeGreaterThan(2 / 3);
  });

  it("reports off-rubric output instead of discarding it", () => {
    const truths = ["support", "support", "internal"];
    const predictions = ["prospect", "spam", "internal"];

    const m = computeFieldMetrics(truths, predictions);

    expect(m.off_rubric_labels).toEqual(["prospect", "spam"]);
    expect(m.off_rubric_predictions).toBe(2);
  });

  it("keeps off-rubric classes visible in per_label", () => {
    const m = computeFieldMetrics(["a", "a"], ["a", "z"]);

    expect(Object.keys(m.per_label).sort()).toEqual(["a", "z"]);
    expect(m.per_label["z"]!.support).toBe(0);
    expect(m.per_label["z"]!.f1).toBe(0);
  });

  it("reports nothing off-rubric when every prediction is in the rubric", () => {
    const m = computeFieldMetrics(["a", "b"], ["a", "a"]);

    expect(m.off_rubric_labels).toEqual([]);
    expect(m.off_rubric_predictions).toBe(0);
  });

  it("returns zeros for an empty input", () => {
    const m = computeFieldMetrics([], []);

    expect(m.macro_f1).toBe(0);
    expect(m.per_label).toEqual({});
    expect(m.off_rubric_labels).toEqual([]);
    expect(m.off_rubric_predictions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The majority-class baseline is the floor a run has to clear. It must be
// derived from the truths alone — no hardcoded class — so it holds for any
// tenant's dataset.
// ---------------------------------------------------------------------------

describe("computeBaseline", () => {
  it("picks the most frequent class", () => {
    const b = computeBaseline(["support", "support", "support", "internal"]);

    expect(b.majority_label).toBe("support");
    expect(b.accuracy).toBeCloseTo(0.75, 5);
  });

  it("scores the constant classifier, not a perfect one", () => {
    // Always answering the majority: majority f1 high, minority f1 0
    const b = computeBaseline(["a", "a", "a", "b"]);

    // a: p 0.75, r 1.00 → f1 0.857 ; b: 0 → macro 0.4286
    expect(b.macro_f1).toBeCloseTo(0.857142857 / 2, 4);
    expect(b.macro_f1).toBeLessThan(1);
  });

  it("is 1.0 only when the ground truth has a single class", () => {
    expect(computeBaseline(["a", "a", "a"]).macro_f1).toBe(1);
  });

  it("breaks ties alphabetically so runs are reproducible", () => {
    expect(computeBaseline(["b", "a"]).majority_label).toBe("a");
    expect(computeBaseline(["a", "b"]).majority_label).toBe("a");
  });

  it("returns zeros for an empty input", () => {
    const b = computeBaseline([]);

    expect(b.majority_label).toBe("");
    expect(b.macro_f1).toBe(0);
    expect(b.accuracy).toBe(0);
  });

  it("is beatable — a real classifier scores above it", () => {
    const truths = ["a", "a", "a", "b"];
    const perfect = computeFieldMetrics(truths, truths).macro_f1;

    expect(perfect).toBeGreaterThan(computeBaseline(truths).macro_f1);
  });
});
