import { describe, expect, it } from "bun:test";
import { normalizeResetEmail } from "./password-reset";

describe("normalizeResetEmail", () => {
  it("trims and lowercases a valid address", () => {
    expect(normalizeResetEmail("  Support@Acme.COM ")).toBe("support@acme.com");
  });

  it("rejects anything that is not an email", () => {
    expect(normalizeResetEmail("")).toBeNull();
    expect(normalizeResetEmail("support")).toBeNull();
    expect(normalizeResetEmail("a b@acme.com")).toBeNull();
    expect(normalizeResetEmail(null)).toBeNull();
    expect(normalizeResetEmail(42)).toBeNull();
  });
});
