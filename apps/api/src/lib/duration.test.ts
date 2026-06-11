import { describe, it, expect } from "bun:test";
import { humanizeDuration } from "./duration.js";

// ---------------------------------------------------------------------------
// KAI-247: humanizeDuration — {{time_to_resolve}}
// ---------------------------------------------------------------------------

describe("humanizeDuration", () => {
  it("formats minutes-only durations", () => {
    expect(humanizeDuration("2026-06-10T10:00:00.000Z", "2026-06-10T10:45:00.000Z")).toBe("45m");
  });

  it("formats hours + minutes", () => {
    expect(humanizeDuration("2026-06-10T10:00:00.000Z", "2026-06-10T14:12:00.000Z")).toBe("4h 12m");
  });

  it("formats days + hours", () => {
    expect(humanizeDuration("2026-06-08T10:00:00.000Z", "2026-06-10T13:00:00.000Z")).toBe("2d 3h");
  });

  it("returns '0m' for a zero (or negative) duration", () => {
    expect(humanizeDuration("2026-06-10T10:00:00.000Z", "2026-06-10T10:00:00.000Z")).toBe("0m");
    expect(humanizeDuration("2026-06-10T10:00:00.000Z", "2026-06-10T09:00:00.000Z")).toBe("0m");
  });
});
