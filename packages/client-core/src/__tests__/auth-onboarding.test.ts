import { describe, expect, it } from "vitest";
import { ownerNeedsOnboarding } from "../auth";

describe("ownerNeedsOnboarding", () => {
  it("sends an owner who has not finished back to the wizard", () => {
    expect(ownerNeedsOnboarding("owner", null, null)).toBe(true);
    expect(ownerNeedsOnboarding("owner", "  ", null)).toBe(true);
  });

  it("lets an owner in once the completion is recorded or the profile has a company name", () => {
    expect(ownerNeedsOnboarding("owner", null, "2026-10-26T12:00:00Z")).toBe(false);
    expect(ownerNeedsOnboarding("owner", "Acme", null)).toBe(false);
  });

  it("never holds back other roles", () => {
    expect(ownerNeedsOnboarding("agent", null, null)).toBe(false);
    expect(ownerNeedsOnboarding(null, null, null)).toBe(false);
  });

  it("allows local onboarding to be replayed without clearing the owner's company name", () => {
    expect(ownerNeedsOnboarding("owner", "Acme", null, true)).toBe(true);
    expect(ownerNeedsOnboarding("owner", "Acme", "2026-01-01T00:00:00Z", true)).toBe(false);
    expect(ownerNeedsOnboarding("agent", "Acme", null, true)).toBe(false);
    expect(ownerNeedsOnboarding("owner", "Acme", null, false)).toBe(false);
  });
});
