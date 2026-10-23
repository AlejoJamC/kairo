import { describe, expect, it } from "bun:test";
import { formatAge } from "./format-age";

const now = Date.parse("2030-01-02T12:00:00Z");

describe("formatAge", () => {
  it("returns nothing without an instant", () => {
    expect(formatAge(null, now)).toBeUndefined();
    expect(formatAge(undefined, now)).toBeUndefined();
  });

  it("counts minutes, hours and days", () => {
    expect(formatAge("2030-01-02T11:59:40Z", now)).toBe("now");
    expect(formatAge("2030-01-02T11:55:00Z", now)).toBe("5m");
    expect(formatAge("2030-01-02T09:00:00Z", now)).toBe("3h");
    expect(formatAge("2029-12-31T12:00:00Z", now)).toBe("2d");
  });

  it("never goes negative for an instant in the future", () => {
    expect(formatAge("2030-01-02T12:05:00Z", now)).toBe("now");
  });
});
