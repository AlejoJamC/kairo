import { describe, it, expect, mock, afterEach } from "bun:test";
import { z } from "zod";
import { OllamaCompletionProvider } from "./completion";

// ---------------------------------------------------------------------------
// KAI-110: completeWithMeta / completeJSONWithMeta surface token usage + rawText
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetchOnce(body: unknown, ok = true) {
  global.fetch = mock(async () =>
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 }),
  ) as unknown as typeof fetch;
}

describe("OllamaCompletionProvider", () => {
  it("completeWithMeta surfaces rawText, model, and token usage", async () => {
    mockFetchOnce({
      response: "hello world",
      model: "llama3.2",
      prompt_eval_count: 42,
      eval_count: 7,
    });

    const provider = new OllamaCompletionProvider("http://localhost:11434", "llama3.2");
    const meta = await provider.completeWithMeta("hi");

    expect(meta.text).toBe("hello world");
    expect(meta.rawText).toBe("hello world");
    expect(meta.model).toBe("llama3.2");
    expect(meta.usage).toEqual({ promptTokens: 42, completionTokens: 7 });
  });

  it("completeWithMeta returns null usage when fields are absent", async () => {
    mockFetchOnce({ response: "no usage data" });

    const provider = new OllamaCompletionProvider("http://localhost:11434", "llama3.2");
    const meta = await provider.completeWithMeta("hi");

    expect(meta.usage).toEqual({ promptTokens: null, completionTokens: null });
    expect(meta.model).toBe("llama3.2");
  });

  it("complete() delegates to completeWithMeta and returns text only", async () => {
    mockFetchOnce({ response: "plain text" });

    const provider = new OllamaCompletionProvider("http://localhost:11434", "llama3.2");
    const text = await provider.complete("hi");

    expect(text).toBe("plain text");
  });

  it("completeJSONWithMeta parses JSON and returns meta", async () => {
    mockFetchOnce({
      response: 'Here is the result: {"foo": "bar"}',
      model: "llama3.2",
      prompt_eval_count: 5,
      eval_count: 3,
    });

    const schema = z.object({ foo: z.string() });
    const provider = new OllamaCompletionProvider("http://localhost:11434", "llama3.2");
    const result = await provider.completeJSONWithMeta("hi", schema);

    expect(result.data).toEqual({ foo: "bar" });
    expect(result.rawText).toBe('Here is the result: {"foo": "bar"}');
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 3 });
  });

  it("completeJSON() delegates to completeJSONWithMeta and returns parsed data only", async () => {
    mockFetchOnce({ response: '{"foo": "baz"}' });

    const schema = z.object({ foo: z.string() });
    const provider = new OllamaCompletionProvider("http://localhost:11434", "llama3.2");
    const data = await provider.completeJSON("hi", schema);

    expect(data).toEqual({ foo: "baz" });
  });
});
