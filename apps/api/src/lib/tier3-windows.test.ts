import { describe, expect, it } from "bun:test";
import { tier3FullInbox, tier3Windows } from "./tier3-windows";

describe("tier3Windows", () => {
  it("keeps the three date windows when deployed", () => {
    expect(tier3Windows({ localTest: false, maxEmailAgeDays: 90 })).toEqual([
      { id: "batch-a-16-30d", range: { daysFrom: 16, daysTo: 30 } },
      { id: "batch-b-31-60d", range: { daysFrom: 31, daysTo: 60 } },
      { id: "batch-c-61-maxd", range: { daysFrom: 61, daysTo: 90 } },
    ]);
  });

  it("takes the whole inbox in one pass on a local test run", () => {
    expect(tier3Windows({ localTest: true, maxEmailAgeDays: 90 })).toEqual([{ id: "batch-all-inbox", range: null }]);
  });
});

describe("tier3FullInbox", () => {
  it("is off by default", () => {
    expect(tier3FullInbox({})).toBe(false);
    expect(tier3FullInbox({ FEATURE_FLAG_TIER3_FULL_INBOX: "" })).toBe(false);
  });

  it("is on only when the flag is true", () => {
    expect(tier3FullInbox({ FEATURE_FLAG_TIER3_FULL_INBOX: "true" })).toBe(true);
    expect(tier3FullInbox({ FEATURE_FLAG_TIER3_FULL_INBOX: " TRUE " })).toBe(true);
    expect(tier3FullInbox({ FEATURE_FLAG_TIER3_FULL_INBOX: "false" })).toBe(false);
    expect(tier3FullInbox({ FEATURE_FLAG_TIER3_FULL_INBOX: "yes" })).toBe(false);
  });
});
