// ---------------------------------------------------------------------------
// KAI-248 Grupo 1 — gmail-client.getMessage requests Message-ID metadata header
//
// poll-account.ts persists messages.message_id_header from this header (used
// for In-Reply-To / References on outbound replies). If the request to Gmail
// doesn't ask for it, the value is always missing — this test guards the
// fetch call shape directly rather than the (already-covered) persistence
// path in poll-account.test.ts.
// ---------------------------------------------------------------------------
import { describe, it, expect, afterEach } from "bun:test";
import { getMessage } from "./gmail-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("getMessage", () => {
  it("requests Message-ID among the metadataHeaders query params", async () => {
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
    const headers = capturedUrl!.searchParams.getAll("metadataHeaders");
    expect(headers).toContain("Message-ID");
    expect(headers).toContain("Subject");
    expect(headers).toContain("From");
  });
});
