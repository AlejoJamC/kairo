import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatMonthYear } from "./date-format";

const instant = new Date(2026, 5, 3, 7, 5).toISOString();

describe("date format", () => {
  it("is day, month, year, whatever the browser locale", () => {
    expect(formatDate(instant)).toBe("03/06/2026");
    expect(formatDateTime(instant)).toBe("03/06/2026 07:05");
    expect(formatMonthYear(instant)).toBe("06/2026");
  });

  it("shows a dash for a missing or invalid date", () => {
    for (const value of [null, undefined, "", "not a date"]) {
      expect(formatDate(value)).toBe("—");
      expect(formatDateTime(value)).toBe("—");
      expect(formatMonthYear(value)).toBe("—");
    }
  });
});
