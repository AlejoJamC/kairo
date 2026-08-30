import { describe, it, expect } from "bun:test";
import { computeAgreement, readKappa } from "./agreement";

describe("computeAgreement", () => {
  it("is 1.0 when the two annotators never differ", () => {
    const a = ["support", "internal", "support", "internal"];

    const r = computeAgreement(a, a);

    expect(r.n).toBe(4);
    expect(r.observed).toBe(1);
    expect(r.kappa).toBe(1);
  });

  // The reason kappa is here at all: a high percentage can be entirely bought
  // by both annotators reaching for the same class most of the time.
  it("reports near-zero kappa when a high percentage is all chance", () => {
    const a = ["support", "support", "support", "support", "internal"];
    const b = ["support", "support", "support", "internal", "support"];

    const r = computeAgreement(a, b);

    expect(r.observed).toBeCloseTo(0.6, 5);
    expect(r.kappa).toBeLessThan(0.1);
  });

  it("goes negative when they agree less than their own habits predict", () => {
    // Each uses both classes equally, and they never coincide
    const a = ["x", "x", "y", "y"];
    const b = ["y", "y", "x", "x"];

    const r = computeAgreement(a, b);

    expect(r.observed).toBe(0);
    expect(r.kappa).toBeLessThan(0);
  });

  it("drops a pair where either side is blank instead of counting it against them", () => {
    const a = ["support", "", "internal", "support"];
    const b = ["support", "internal", "  ", "support"];

    const r = computeAgreement(a, b);

    expect(r.n).toBe(2);
    expect(r.observed).toBe(1);
  });

  it("returns zeros when nothing is comparable", () => {
    expect(computeAgreement([], [])).toEqual({ n: 0, observed: 0, expected: 0, kappa: 0 });
    expect(computeAgreement(["", ""], ["a", "b"]).n).toBe(0);
  });

  // Chance agreement of 1 leaves no room above it, so kappa is undefined.
  // Reported as 0 rather than as NaN or a division by zero.
  it("does not divide by zero when both only ever used one class", () => {
    const r = computeAgreement(["a", "a", "a"], ["a", "a", "a"]);

    expect(r.observed).toBe(1);
    expect(r.expected).toBe(1);
    expect(r.kappa).toBe(0);
    expect(Number.isNaN(r.kappa)).toBe(false);
  });

  it("ignores trailing indices when the columns are ragged", () => {
    expect(computeAgreement(["a", "b", "c"], ["a", "b"]).n).toBe(2);
  });
});

describe("readKappa", () => {
  it("names the bands a reader would otherwise have to look up", () => {
    expect(readKappa(-0.05)).toBe("no better than chance");
    expect(readKappa(0)).toBe("no better than chance");
    expect(readKappa(0.10)).toBe("slight");
    expect(readKappa(0.24)).toBe("fair");
    expect(readKappa(0.51)).toBe("moderate");
    expect(readKappa(0.63)).toBe("substantial");
    expect(readKappa(0.90)).toBe("almost perfect");
  });
});
