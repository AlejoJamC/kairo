import { describe, it, expect } from "bun:test";
import { CorrectClassificationSchema } from "./classification.js";

describe("CorrectClassificationSchema", () => {
  it("accepts a single correction field", () => {
    expect(CorrectClassificationSchema.safeParse({ correct_priority: "P1" }).success).toBe(true);
    expect(CorrectClassificationSchema.safeParse({ correct_category: "billing" }).success).toBe(true);
    expect(CorrectClassificationSchema.safeParse({ correct_ticket_type: "spam" }).success).toBe(true);
    expect(CorrectClassificationSchema.safeParse({ correct_sentiment: "neutral" }).success).toBe(true);
  });

  it("accepts all correction fields together with notes", () => {
    expect(CorrectClassificationSchema.safeParse({
      correct_ticket_type: "support",
      correct_priority:    "P2",
      correct_category:    "technical",
      correct_sentiment:   "frustrated",
      notes:               "wrong category",
    }).success).toBe(true);
  });

  it("rejects empty body — no correction field provided", () => {
    expect(CorrectClassificationSchema.safeParse({}).success).toBe(false);
    expect(CorrectClassificationSchema.safeParse({ notes: "just a note" }).success).toBe(false);
  });

  it("rejects invalid enum values", () => {
    expect(CorrectClassificationSchema.safeParse({ correct_priority: "P4" }).success).toBe(false);
    expect(CorrectClassificationSchema.safeParse({ correct_category: "unknown" }).success).toBe(false);
    expect(CorrectClassificationSchema.safeParse({ correct_ticket_type: "lead" }).success).toBe(false);
    expect(CorrectClassificationSchema.safeParse({ correct_sentiment: "angry" }).success).toBe(false);
  });

  it("rejects notes over 2000 chars", () => {
    expect(CorrectClassificationSchema.safeParse({
      correct_priority: "P1",
      notes: "a".repeat(2001),
    }).success).toBe(false);
  });
});
