import { describe, it, expect } from "bun:test";

import { TYPE_CORRECTION_SCORE, sendTypeCorrectionScore, typeCorrectionScore } from "./langfuse-scores";

const correction = {
  ticketId: "t-1",
  accountId: "acc-1",
  from: "support",
  to: "prospect",
  derivationVersion: "1.1.0",
  promptVersion: "1.5.1",
  routingPolicyVersion: "1.2.0",
};

describe("typeCorrectionScore", () => {
  // The generations are grouped under sessionId = ticketId (classify.ts), so
  // the score has to target the same session to sit next to them.
  it("scores the ticket's session with the type the person chose", () => {
    const score = typeCorrectionScore(correction);

    expect(score.name).toBe(TYPE_CORRECTION_SCORE);
    expect(score.sessionId).toBe("t-1");
    expect(score.dataType).toBe("CATEGORICAL");
    expect(score.value).toBe("prospect");
    expect(score.metadata).toEqual({
      accountId: "acc-1",
      fromType: "support",
      toType: "prospect",
      derivationVersion: "1.1.0",
      promptVersion: "1.5.1",
      routingPolicyVersion: "1.2.0",
    });
  });
});

describe("sendTypeCorrectionScore", () => {
  it("sends nothing when Langfuse is not configured", async () => {
    await expect(sendTypeCorrectionScore(correction, null)).resolves.toBeUndefined();
  });

  it("sends the score", async () => {
    const sent: unknown[] = [];
    const client = { scores: { create: async (req: unknown) => { sent.push(req); return { id: "s" }; } } };

    await sendTypeCorrectionScore(correction, client as never);

    expect(sent).toEqual([typeCorrectionScore(correction)]);
  });

  // The correction is already saved; telemetry failing must not surface.
  it("never rejects when the send fails", async () => {
    const client = { scores: { create: async () => { throw new Error("down"); } } };

    await expect(sendTypeCorrectionScore(correction, client as never)).resolves.toBeUndefined();
  });
});
