import { describe, it, expect } from "bun:test";
import { CORPORA, resolveCorpus } from "./corpus";

describe("resolveCorpus", () => {
  it("defaults to main, so every existing command keeps its meaning", () => {
    expect(resolveCorpus({}).id).toBe("main");
    expect(resolveCorpus({ EVAL_CORPUS: "  " }).id).toBe("main");
  });

  it("selects the coverage corpus by name", () => {
    expect(resolveCorpus({ EVAL_CORPUS: "coverage" }).id).toBe("coverage");
  });

  // Falling back to main here would produce a report that describes a corpus
  // nobody asked for, with nothing in it saying so.
  it("throws on an unknown name instead of falling back", () => {
    expect(() => resolveCorpus({ EVAL_CORPUS: "edge" })).toThrow(/Unknown EVAL_CORPUS/);
  });
});

describe("CORPORA", () => {
  it("keeps main writing where every archived run already points", () => {
    expect(CORPORA.main.outputSubdir).toBe("");
    expect(CORPORA.main.groundTruth).toBe("data/input/ground_truth_50.csv");
  });

  // Its own subtree, so it gets its own cell directories and its own ledger:
  // a ledger only means anything against the cell count it was written for.
  it("gives every other corpus a separate output subtree", () => {
    for (const c of Object.values(CORPORA)) {
      if (c.id === "main") continue;
      expect(c.outputSubdir).not.toBe("");
    }
  });

  it("gives every corpus its own emails and its own sheet", () => {
    const dirs = Object.values(CORPORA).map((c) => c.emlDir);
    const sheets = Object.values(CORPORA).map((c) => c.groundTruth);

    expect(new Set(dirs).size).toBe(dirs.length);
    expect(new Set(sheets).size).toBe(sheets.length);
  });
});
