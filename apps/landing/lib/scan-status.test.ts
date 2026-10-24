import { describe, expect, it } from "bun:test";
import { deriveScanStatus } from "./scan-status";

const now = new Date("2026-10-24T22:30:00Z");
const quiet = "2026-10-24T22:20:00Z";
const recent = "2026-10-24T22:29:30Z";

describe("deriveScanStatus", () => {
  it("is idle before the scan has written anything", () => {
    expect(deriveScanStatus({ messagesTotal: 0, messagesClassified: 0, messagesFailed: 0, lastActivityAt: null }, now)).toBe("idle");
  });

  it("is in progress while the scan is still writing, even with failures so far", () => {
    expect(deriveScanStatus({ messagesTotal: 10, messagesClassified: 0, messagesFailed: 4, lastActivityAt: recent }, now)).toBe("in_progress");
  });

  it("is failed when the scan settled with failures and nothing classified", () => {
    expect(deriveScanStatus({ messagesTotal: 30, messagesClassified: 0, messagesFailed: 19, lastActivityAt: quiet }, now)).toBe("failed");
  });

  it("is complete when something was classified, even if other emails failed", () => {
    expect(deriveScanStatus({ messagesTotal: 30, messagesClassified: 5, messagesFailed: 3, lastActivityAt: quiet }, now)).toBe("complete");
  });

  it("is complete when every email was skipped and none failed", () => {
    expect(deriveScanStatus({ messagesTotal: 12, messagesClassified: 0, messagesFailed: 0, lastActivityAt: quiet }, now)).toBe("complete");
  });
});
