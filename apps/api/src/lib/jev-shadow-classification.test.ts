import { describe, it, expect, mock } from "bun:test";
import type { classifyEmailWithJev, DecisionProvider, EmailMessage } from "@kairo/intelligence";
import { classifyJevShadow } from "./jev-shadow-classification.js";
import type { LlmCallLogEntry } from "./llm-logging.js";

const message: EmailMessage = { subject: "Cannot log in", body: "help", from: "client@outside.com" };
const context = { accountId: "acct-1", ticketId: "ticket-1" };

function fakeProvider(): DecisionProvider {
  return {
    provider: "jev",
    model: "jev-latest",
    decide: mock(async () => ({ value: {}, confidence: null, provider: "jev", modelVersion: "jev-latest", latencyMs: 5 })) as DecisionProvider["decide"],
  };
}

describe("classifyJevShadow", () => {
  it("logs the decision to llm_calls without touching the ticket", async () => {
    const log = mock((_entry: LlmCallLogEntry) => {});
    const classify = mock(async () => ({
      result: { type: "support", category: "technical", priority: "P2", tone: "neutral", urgency: "medium", confidence: 0.9, reasoning: "x" },
      verdict: { confidence: 0.87 },
      decision: { value: { a: 1 }, confidence: null, provider: "jev", modelVersion: "jev-latest", latencyMs: 42 },
    })) as unknown as typeof classifyEmailWithJev;

    await classifyJevShadow(message, context, {
      createProvider: fakeProvider,
      classify,
      log,
    });

    expect(classify).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0]![0];
    expect(entry.feature).toBe("email_classification_jev_shadow");
    expect(entry.provider).toBe("jev");
    expect(entry.model).toBe("jev-latest");
    expect(entry.confidenceScore).toBe(0.87);
    expect(entry.latencyMs).toBe(42);
    expect(entry.accountId).toBe("acct-1");
    expect(entry.ticketId).toBe("ticket-1");
    expect(entry.errorCode).toBeUndefined();
  });

  it("logs an error row instead of throwing when the provider is not configured", async () => {
    const log = mock((_entry: LlmCallLogEntry) => {});
    const createProvider = mock(() => {
      throw new Error("TYPESAFE_API_KEY required to use the jev decision provider");
    });
    const classify = mock(async () => {
      throw new Error("unreachable");
    }) as unknown as typeof classifyEmailWithJev;

    await expect(
      classifyJevShadow(message, context, { createProvider, classify, log }),
    ).resolves.toBeUndefined();

    expect(classify).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0]![0];
    expect(entry.errorCode).toBe("JEV_SHADOW_ERROR");
    expect(entry.errorDetail).toContain("TYPESAFE_API_KEY");
    expect(entry.accountId).toBe("acct-1");
    expect(entry.ticketId).toBe("ticket-1");
  });

  it("logs an error row when the decision call itself fails", async () => {
    const log = mock((_entry: LlmCallLogEntry) => {});
    const classify = mock(async () => {
      throw new Error("provider timeout");
    }) as unknown as typeof classifyEmailWithJev;

    await classifyJevShadow(message, context, { createProvider: fakeProvider, classify, log });

    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0]![0];
    expect(entry.errorCode).toBe("JEV_SHADOW_ERROR");
    expect(entry.errorDetail).toBe("provider timeout");
  });
});
