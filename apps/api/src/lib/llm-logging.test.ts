import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-110: logLlmCall unit tests
// ---------------------------------------------------------------------------

const insertMock = mock((_row: Record<string, unknown>) => ({
  then: (cb: (res: { error: { message: string } | null }) => void) => {
    cb({ error: null });
  },
}));
const fromMock = mock(() => ({ insert: insertMock }));

mock.module("./supabase.js", () => ({
  supabase: { from: fromMock },
}));

const { logLlmCall } = await import("./llm-logging.js");

describe("logLlmCall", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it("skips insert entirely in test environment", () => {
    expect(process.env["NODE_ENV"]).toBe("test");

    logLlmCall({
      feature: "email_classification",
      model: "ollama",
      promptText: "hello",
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("would map fields to real llm_calls columns when not in test env", () => {
    const original = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";

    try {
      logLlmCall({
        feature: "email_classification",
        provider: "ollama",
        model: "llama3.2",
        promptVersion: "1.0.0",
        promptText: "prompt text",
        responseText: "response text",
        promptTokens: 10,
        completionTokens: 20,
        confidenceScore: 0.9,
        latencyMs: 123,
        triggeredByUserId: "user-1",
        accountId: "acct-1",
        ticketId: "ticket-1",
      });

      expect(fromMock).toHaveBeenCalledWith("llm_calls");
      expect(insertMock).toHaveBeenCalledTimes(1);
      const row = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(row["triggered_by_user_id"]).toBe("user-1");
      expect(row["account_id"]).toBe("acct-1");
      expect(row["ticket_id"]).toBe("ticket-1");
      expect(row["feature"]).toBe("email_classification");
      expect(row["provider"]).toBe("ollama");
      expect(row["model"]).toBe("llama3.2");
      expect(row["prompt_version"]).toBe("1.0.0");
      expect(row["prompt_text"]).toBe("prompt text");
      expect(row["response_text"]).toBe("response text");
      expect(row["prompt_tokens"]).toBe(10);
      expect(row["completion_tokens"]).toBe(20);
      expect(row["confidence_score"]).toBe(0.9);
      expect(row["latency_ms"]).toBe(123);
      expect(row["error_code"]).toBeNull();
      expect(row["error_detail"]).toBeNull();
      expect(row).not.toHaveProperty("user_id");
    } finally {
      process.env["NODE_ENV"] = original;
    }
  });

  it("defaults provider from INTELLIGENCE_PROVIDER env var", () => {
    const originalEnv = process.env["NODE_ENV"];
    const originalProvider = process.env["INTELLIGENCE_PROVIDER"];
    process.env["NODE_ENV"] = "production";
    process.env["INTELLIGENCE_PROVIDER"] = "anthropic";

    try {
      logLlmCall({
        feature: "reply_suggestion",
        model: "claude-sonnet-4-20250514",
        promptText: "p",
      });

      const row = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(row["provider"]).toBe("anthropic");
    } finally {
      process.env["NODE_ENV"] = originalEnv;
      if (originalProvider === undefined) delete process.env["INTELLIGENCE_PROVIDER"];
      else process.env["INTELLIGENCE_PROVIDER"] = originalProvider;
    }
  });
});
