import { describe, expect, it } from "bun:test";
import { progressSignature } from "./useClassificationProgress";

const base = { messages_total: 5, messages_classified: 3, tickets_count: 3, last_classified_at: "2026-11-05T00:06:40Z" };

describe("progressSignature", () => {
  it("is the same while nothing advances", () => {
    expect(progressSignature({ ...base })).toBe(progressSignature({ ...base }));
  });

  it("changes when messages are read, classified or turned into tickets", () => {
    const signature = progressSignature(base);
    expect(progressSignature({ ...base, messages_total: 6 })).not.toBe(signature);
    expect(progressSignature({ ...base, messages_classified: 4 })).not.toBe(signature);
    expect(progressSignature({ ...base, tickets_count: 4 })).not.toBe(signature);
    expect(progressSignature({ ...base, last_classified_at: "2026-11-05T00:07:00Z" })).not.toBe(signature);
  });
});
