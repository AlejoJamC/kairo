import { describe, it, expect } from "vitest";
import { isFlagEnabled } from "../ai-assistant";

// Right Panel tabs (VITE_FF_ENABLE_ASSISTANT_TAB / CLIENT_TAB / SIMILAR_TAB /
// ARTICLES_TAB / ESCALATE_TAB) are build-time flags read via isFlagEnabled().
// These tests cover the parsing rule directly so they don't depend on
// .env.local (gitignored, differs between machines and CI).
describe("isFlagEnabled (VITE_FF_* parsing)", () => {
  it("is true only for the literal string 'true'", () => {
    expect(isFlagEnabled("true")).toBe(true);
  });

  it("is false for 'false'", () => {
    expect(isFlagEnabled("false")).toBe(false);
  });

  it("is false when unset", () => {
    expect(isFlagEnabled(undefined)).toBe(false);
  });

  it("is false for any non-'true' value", () => {
    expect(isFlagEnabled("1")).toBe(false);
    expect(isFlagEnabled("TRUE")).toBe(false);
    expect(isFlagEnabled("")).toBe(false);
  });
});
