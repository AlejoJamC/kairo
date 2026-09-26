import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-110: logLlmCall unit tests
// KAI-61: recordLlmCall — provider column must come from the record when the
// caller supplies one (a DecisionProvider call is never INTELLIGENCE_PROVIDER),
// falling back to the env var only for callers that predate that field.
// ---------------------------------------------------------------------------

let selectSingleResult: { data: { id: string } | null; error: { message: string } | null } = {
  data: { id: "row-1" },
  error: null,
};

const insertMock = mock((_row: Record<string, unknown>) => ({
  then: (cb: (res: { error: { message: string } | null }) => void) => {
    cb({ error: null });
  },
  select: (_fields: string) => ({
    single: async () => selectSingleResult,
  }),
}));
const fromMock = mock(() => ({ insert: insertMock }));

mock.module("./supabase.js", () => ({
  supabase: { from: fromMock },
}));

const { logLlmCall, recordLlmCall } = await import("./llm-logging.js");

describe("logLlmCall", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
    selectSingleResult = { data: { id: "row-1" }, error: null };
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

describe("recordLlmCall", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
    selectSingleResult = { data: { id: "row-1" }, error: null };
  });

  it("returns null and skips insert in test environment", async () => {
    expect(process.env["NODE_ENV"]).toBe("test");

    const id = await recordLlmCall({
      feature: "email_classification",
      model: "llama3.2",
      promptVersion: null,
      promptText: "p",
      responseText: null,
      promptTokens: null,
      completionTokens: null,
      confidenceScore: null,
      latencyMs: 1,
      errorCode: null,
      errorDetail: null,
    });

    expect(id).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("writes the record's own provider, not INTELLIGENCE_PROVIDER — a decision provider is never that variable", async () => {
    const originalEnv = process.env["NODE_ENV"];
    const originalProvider = process.env["INTELLIGENCE_PROVIDER"];
    process.env["NODE_ENV"] = "production";
    process.env["INTELLIGENCE_PROVIDER"] = "ollama";

    try {
      const id = await recordLlmCall({
        feature: "ticket_category",
        provider: "jev",
        model: "jev-latest",
        promptVersion: null,
        promptText: '{"state":"x"}',
        responseText: '{"category":"billing"}',
        promptTokens: 30,
        completionTokens: 5,
        confidenceScore: 0.9,
        latencyMs: 12,
        errorCode: null,
        errorDetail: null,
      });

      expect(id).toBe("row-1");
      const row = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(row["provider"]).toBe("jev");
    } finally {
      process.env["NODE_ENV"] = originalEnv;
      if (originalProvider === undefined) delete process.env["INTELLIGENCE_PROVIDER"];
      else process.env["INTELLIGENCE_PROVIDER"] = originalProvider;
    }
  });

  it("falls back to INTELLIGENCE_PROVIDER for a caller that predates the field", async () => {
    const originalEnv = process.env["NODE_ENV"];
    const originalProvider = process.env["INTELLIGENCE_PROVIDER"];
    process.env["NODE_ENV"] = "production";
    process.env["INTELLIGENCE_PROVIDER"] = "anthropic";

    try {
      await recordLlmCall({
        feature: "reply_suggestion",
        model: "claude-sonnet-4-20250514",
        promptVersion: "1.0.0",
        promptText: "p",
        responseText: "r",
        promptTokens: 1,
        completionTokens: 1,
        confidenceScore: null,
        latencyMs: 1,
        errorCode: null,
        errorDetail: null,
      });

      const row = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(row["provider"]).toBe("anthropic");
    } finally {
      process.env["NODE_ENV"] = originalEnv;
      if (originalProvider === undefined) delete process.env["INTELLIGENCE_PROVIDER"];
      else process.env["INTELLIGENCE_PROVIDER"] = originalProvider;
    }
  });

  it("returns null when the insert errors, instead of throwing", async () => {
    const original = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    selectSingleResult = { data: null, error: { message: "insert failed" } };

    try {
      const id = await recordLlmCall({
        feature: "ticket_category",
        provider: "jev",
        model: "jev-latest",
        promptVersion: null,
        promptText: "p",
        responseText: null,
        promptTokens: null,
        completionTokens: null,
        confidenceScore: null,
        latencyMs: 1,
        errorCode: null,
        errorDetail: null,
      });
      expect(id).toBeNull();
    } finally {
      process.env["NODE_ENV"] = original;
    }
  });
});
