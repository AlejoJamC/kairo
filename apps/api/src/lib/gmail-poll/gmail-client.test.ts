import { describe, it, expect, afterEach } from "bun:test";
import { getMessage } from "./gmail-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("getMessage", () => {
  it("requests full MIME content including all headers", async () => {
    let capturedUrl: URL | null = null;

    globalThis.fetch = (async (input: string | URL | Request) => {
      capturedUrl = new URL(String(input));
      return new Response(
        JSON.stringify({ id: "m1", threadId: "t1", payload: { headers: [] } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    await getMessage("fake-token", "m1");

    expect(capturedUrl).not.toBeNull();
    expect(capturedUrl!.searchParams.get('format')).toBe('full');
    expect(capturedUrl!.searchParams.has('metadataHeaders')).toBe(false);
  });
});
