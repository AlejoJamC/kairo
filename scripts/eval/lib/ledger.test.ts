import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Ledger } from "./ledger";

let dir = "";
const path = () => join(dir, "state", "ledger.jsonl");

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ledger-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("Ledger", () => {
  it("starts empty and creates its directory", () => {
    const l = new Ledger(path());

    expect(l.completed).toBe(0);
    expect(l.has("a|b|c")).toBe(false);
  });

  // A thousand classifications cannot be redone because a run was interrupted
  it("remembers completed cells across instances, so a resumed run does only the delta", () => {
    const first = new Ledger(path());
    first.record("m|onboarding|001", true, 120);
    first.record("m|backfill|001", true, 90);

    const resumed = new Ledger(path());

    expect(resumed.completed).toBe(2);
    expect(resumed.has("m|onboarding|001")).toBe(true);
    expect(resumed.has("m|backfill|001")).toBe(true);
    expect(resumed.has("m|onboarding|002")).toBe(false);
  });

  it("does not treat a failed cell as done, so it is retried", () => {
    const l = new Ledger(path());
    l.record("m|onboarding|001", false, 40);

    expect(l.has("m|onboarding|001")).toBe(false);
    expect(new Ledger(path()).has("m|onboarding|001")).toBe(false);
  });

  // Killing the process mid-append leaves a truncated final line
  it("survives a half-written last line instead of refusing to load", () => {
    const l = new Ledger(path());
    l.record("m|onboarding|001", true, 10);
    l.record("m|onboarding|002", true, 10);
    appendFileSync(path(), '{"key":"m|onboarding|003","ok":tr');

    const resumed = new Ledger(path());

    expect(resumed.completed).toBe(2);
    expect(resumed.has("m|onboarding|002")).toBe(true);
    expect(resumed.has("m|onboarding|003")).toBe(false);
  });

  it("records one line per cell, with the outcome and duration", () => {
    const l = new Ledger(path());
    l.record("m|onboarding|001", true, 1234);

    const [entry] = readFileSync(path(), "utf-8").trim().split("\n").map((x) => JSON.parse(x));

    expect(entry.key).toBe("m|onboarding|001");
    expect(entry.ok).toBe(true);
    expect(entry.ms).toBe(1234);
    expect(typeof entry.at).toBe("string");
  });

  it("counts a repeated cell once", () => {
    const l = new Ledger(path());
    l.record("m|onboarding|001", true, 10);
    l.record("m|onboarding|001", true, 10);

    expect(l.completed).toBe(1);
  });
});
