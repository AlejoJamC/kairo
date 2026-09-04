import { describe, it, expect } from "bun:test";
import { computeFieldMetrics, computeBaseline } from "./metrics";

// ---------------------------------------------------------------------------
// KAI-93: the macro average must ignore classes the ground truth never uses.
// Averaging them in caps the score below any useful threshold before a single
// correct answer is counted, which is how the eval became unable to emit a GO
// for any model. These tests freeze that behaviour.
// ---------------------------------------------------------------------------

describe("computeFieldMetrics — classes the ground truth never uses", () => {
  it("averages over ground-truth classes only", () => {
    // 2 real classes, model emits a third the truth never contains
    const truths = ["support", "support", "support", "internal"];
    const predictions = ["support", "support", "prospect", "internal"];

    const m = computeFieldMetrics(truths, predictions);

    // support: tp 2, fp 0, fn 1 → p 1.00, r 0.67, f1 0.80
    // internal: perfect → f1 1.00
    // prospect: support 0 → its own F1 is left out of the macro
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

  it("reports output on absent classes instead of discarding it", () => {
    const truths = ["support", "support", "internal"];
    const predictions = ["prospect", "spam", "internal"];

    const m = computeFieldMetrics(truths, predictions);

    expect(m.off_ground_truth_labels).toEqual(["prospect", "spam"]);
    expect(m.off_ground_truth_predictions).toBe(2);
  });

  it("keeps absent classes visible in per_label", () => {
    const m = computeFieldMetrics(["a", "a"], ["a", "z"]);

    expect(Object.keys(m.per_label).sort()).toEqual(["a", "z"]);
    expect(m.per_label["z"]!.support).toBe(0);
    expect(m.per_label["z"]!.f1).toBe(0);
  });

  it("reports nothing when every prediction lands on a ground-truth class", () => {
    const m = computeFieldMetrics(["a", "b"], ["a", "a"]);

    expect(m.off_ground_truth_labels).toEqual([]);
    expect(m.off_ground_truth_predictions).toBe(0);
  });

  it("returns zeros for an empty input", () => {
    const m = computeFieldMetrics([], []);

    expect(m.macro_f1).toBe(0);
    expect(m.per_label).toEqual({});
    expect(m.off_ground_truth_labels).toEqual([]);
    expect(m.off_ground_truth_predictions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Two separate failures, deliberately not merged into one number.
//
//   off_ground_truth — a class the rubric allows that this corpus never uses.
//                      A gap in the corpus, not a defect in the model.
//   off_contract     — a value the prompt never offered. A real model defect.
//
// Before they were split, a legal `billing` prediction and a garbage `"alta"`
// prediction were reported as the same thing, under a name that blamed the
// model for both.
// ---------------------------------------------------------------------------

describe("computeFieldMetrics — contract violations", () => {
  const CONTRACT = ["support", "internal", "prospect", "spam", "other"] as const;

  it("does not flag a legal class the corpus simply never uses", () => {
    const m = computeFieldMetrics(
      ["support", "support", "internal"],
      ["support", "prospect", "internal"],
      CONTRACT,
    );

    // `prospect` is in the contract but not in the truths: corpus gap, not defect
    expect(m.off_ground_truth_labels).toEqual(["prospect"]);
    expect(m.off_ground_truth_predictions).toBe(1);
    expect(m.off_contract_labels).toEqual([]);
    expect(m.off_contract_predictions).toBe(0);
  });

  it("flags a value the contract does not contain", () => {
    const m = computeFieldMetrics(
      ["support", "support"],
      ["support", "soporte"],
      CONTRACT,
    );

    expect(m.off_contract_labels).toEqual(["soporte"]);
    expect(m.off_contract_predictions).toBe(1);
    // It is also absent from the ground truth, so both counters see it
    expect(m.off_ground_truth_predictions).toBe(1);
  });

  it("stays empty when no contract is supplied", () => {
    const m = computeFieldMetrics(["support"], ["soporte"]);

    expect(m.off_contract_labels).toEqual([]);
    expect(m.off_contract_predictions).toBe(0);
  });

  it("does not count a blank prediction as a contract violation", () => {
    const m = computeFieldMetrics(["support", "support"], ["support", ""], CONTRACT);

    expect(m.off_contract_predictions).toBe(0);
  });

  it("counts every prediction on the offending label, not just the label", () => {
    const m = computeFieldMetrics(
      ["support", "support", "support"],
      ["soporte", "soporte", "support"],
      CONTRACT,
    );

    expect(m.off_contract_labels).toEqual(["soporte"]);
    expect(m.off_contract_predictions).toBe(2);
  });

  it("leaves the macro F1 untouched — this is a report, not a penalty", () => {
    const truths = ["support", "support", "internal"];
    const predictions = ["support", "prospect", "internal"];

    expect(computeFieldMetrics(truths, predictions, CONTRACT).macro_f1)
      .toBe(computeFieldMetrics(truths, predictions).macro_f1);
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
