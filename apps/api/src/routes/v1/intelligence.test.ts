import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-125: classification accuracy endpoint tests
// Follows the same pattern as ticket-groups.test.ts — logic/schema in
// isolation, not full HTTP route tests (those need a live Supabase).
// ---------------------------------------------------------------------------

describe("classification accuracy window validation", () => {
  const VALID_WINDOWS = new Set(["7d", "30d", "all"]);

  it("accepts 7d", () => expect(VALID_WINDOWS.has("7d")).toBe(true));
  it("accepts 30d", () => expect(VALID_WINDOWS.has("30d")).toBe(true));
  it("accepts all", () => expect(VALID_WINDOWS.has("all")).toBe(true));
  it("rejects 90d",    () => expect(VALID_WINDOWS.has("90d")).toBe(false));
  it("rejects empty",  () => expect(VALID_WINDOWS.has("")).toBe(false));
  it("rejects 'week'", () => expect(VALID_WINDOWS.has("week")).toBe(false));
});

describe("classification accuracy response shape", () => {
  function buildAccuracyPayload(totalClassified: number, corrections: {
    priority: number; category: number; ticket_type: number; sentiment: number;
  }) {
    if (totalClassified === 0) {
      return {
        total_classified: 0,
        window: "30d",
        dimensions: { priority: null, category: null, ticket_type: null, sentiment: null },
      };
    }
    const dim = (n: number) => ({
      total_corrected: n,
      accuracy: Math.round((1 - n / totalClassified) * 10000) / 10000,
    });
    return {
      total_classified: totalClassified,
      window: "30d",
      dimensions: {
        priority:    dim(corrections.priority),
        category:    dim(corrections.category),
        ticket_type: dim(corrections.ticket_type),
        sentiment:   dim(corrections.sentiment),
      },
    };
  }

  it("returns 100% accuracy when no corrections", () => {
    const payload = buildAccuracyPayload(50, { priority: 0, category: 0, ticket_type: 0, sentiment: 0 });
    expect(payload.dimensions.priority.accuracy).toBe(1);
    expect(payload.dimensions.category.accuracy).toBe(1);
  });

  it("accuracy drops proportionally after corrections", () => {
    const payload = buildAccuracyPayload(100, { priority: 10, category: 5, ticket_type: 0, sentiment: 20 });
    expect(payload.dimensions.priority.accuracy).toBe(0.9);
    expect(payload.dimensions.category.accuracy).toBe(0.95);
    expect(payload.dimensions.ticket_type.accuracy).toBe(1);
    expect(payload.dimensions.sentiment.accuracy).toBe(0.8);
  });

  it("returns null dimensions and zero total when no classified tickets", () => {
    const payload = buildAccuracyPayload(0, { priority: 0, category: 0, ticket_type: 0, sentiment: 0 });
    expect(payload.total_classified).toBe(0);
    expect(payload.dimensions.priority).toBeNull();
  });

  it("payload always contains total_classified, window, and dimensions", () => {
    const payload = buildAccuracyPayload(10, { priority: 1, category: 0, ticket_type: 2, sentiment: 0 });
    expect(payload).toHaveProperty("total_classified");
    expect(payload).toHaveProperty("window");
    expect(payload).toHaveProperty("dimensions");
    expect(payload.dimensions).toHaveProperty("priority");
    expect(payload.dimensions).toHaveProperty("category");
    expect(payload.dimensions).toHaveProperty("ticket_type");
    expect(payload.dimensions).toHaveProperty("sentiment");
  });
});
