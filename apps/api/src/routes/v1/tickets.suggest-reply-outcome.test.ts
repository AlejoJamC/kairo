import { describe, it, expect } from "bun:test";
import { z } from "zod";

// ---------------------------------------------------------------------------
// KAI-110: PATCH /v1/tickets/:id/suggest-reply/:llmCallId/outcome
// Schema validation unit tests (mirrors convention in tickets.reply.test.ts —
// pure logic only, no Supabase dependency).
// ---------------------------------------------------------------------------

const LlmCallOutcomeSchema = z.object({
  outcome: z.enum(["accepted", "edited", "rejected", "ignored", "auto_applied"]),
});

describe("LlmCallOutcomeSchema — request validation", () => {
  it.each(["accepted", "edited", "rejected", "ignored", "auto_applied"])(
    "accepts '%s' as a valid outcome",
    (outcome) => {
      expect(LlmCallOutcomeSchema.safeParse({ outcome }).success).toBe(true);
    },
  );

  it("rejects an unknown outcome value", () => {
    expect(LlmCallOutcomeSchema.safeParse({ outcome: "maybe" }).success).toBe(false);
  });

  it("rejects a missing outcome field", () => {
    expect(LlmCallOutcomeSchema.safeParse({}).success).toBe(false);
  });
});
