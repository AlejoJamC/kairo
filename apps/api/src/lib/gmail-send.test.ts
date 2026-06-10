import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { GmailSendException } from "./gmail-send.js";

// ---------------------------------------------------------------------------
// KAI-29: gmail-send helper tests — all Gmail API calls are mocked
// ---------------------------------------------------------------------------

const mockFetch = mock(async (_url: string, _opts: RequestInit) => ({
  ok: true,
  status: 200,
  json: async () => ({ id: "msg-abc123", threadId: "thread-xyz" }),
  text: async () => "",
}));

// Patch global fetch before importing the module
globalThis.fetch = mockFetch as unknown as typeof fetch;

const { sendGmailReply } = await import("./gmail-send.js");

const BASE_OPTS = {
  accessToken: "valid-token",
  threadId: "thread-xyz",
  to: "client@example.com",
  subject: "Re: Support ticket",
  bodyPlain: "Hello, here is our response.",
};

beforeEach(() => mockFetch.mockClear());

afterEach(() => mockFetch.mockClear());

describe("sendGmailReply — success", () => {
  it("calls Gmail send endpoint with Bearer token", async () => {
    const result = await sendGmailReply(BASE_OPTS);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("messages/send");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer valid-token");
  });

  it("sends threadId in request body", async () => {
    await sendGmailReply(BASE_OPTS);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.threadId).toBe("thread-xyz");
  });

  it("includes base64url-encoded raw MIME in body", async () => {
    await sendGmailReply(BASE_OPTS);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(typeof body.raw).toBe("string");
    // base64url must not contain +, /, or trailing =
    expect(body.raw).not.toMatch(/[+/=]/);
  });

  it("returns messageId and threadId from Gmail response", async () => {
    const result = await sendGmailReply(BASE_OPTS);
    expect(result.messageId).toBe("msg-abc123");
    expect(result.threadId).toBe("thread-xyz");
  });
});

describe("sendGmailReply — GMAIL_TOKEN_EXPIRED", () => {
  it("throws GmailSendException with code GMAIL_TOKEN_EXPIRED on 401", async () => {
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));

    await expect(sendGmailReply(BASE_OPTS)).rejects.toBeInstanceOf(GmailSendException);
    try {
      await sendGmailReply({ ...BASE_OPTS });
    } catch (err) {
      expect((err as GmailSendException).gmailError.code).toBe("GMAIL_TOKEN_EXPIRED");
    }
  });
});

describe("sendGmailReply — INSUFFICIENT_SCOPE", () => {
  it("throws GmailSendException with code INSUFFICIENT_SCOPE on 403 with insufficient-scope body", async () => {
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 403,
      text: async () => "Request had insufficient authentication scopes.",
    }));

    try {
      await sendGmailReply(BASE_OPTS);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(GmailSendException);
      expect((err as GmailSendException).gmailError.code).toBe("INSUFFICIENT_SCOPE");
    }
  });

  it("falls back to GMAIL_API_ERROR on 403 without an insufficient-scope signature", async () => {
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    }));

    try {
      await sendGmailReply(BASE_OPTS);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(GmailSendException);
      expect((err as GmailSendException).gmailError.code).toBe("GMAIL_API_ERROR");
    }
  });
});

describe("sendGmailReply — GMAIL_API_ERROR", () => {
  it("throws GmailSendException with code GMAIL_API_ERROR on 5xx", async () => {
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    try {
      await sendGmailReply(BASE_OPTS);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(GmailSendException);
      expect((err as GmailSendException).gmailError.code).toBe("GMAIL_API_ERROR");
    }
  });

  it("includes detail in GMAIL_API_ERROR", async () => {
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    }));

    try {
      await sendGmailReply(BASE_OPTS);
    } catch (err) {
      const e = err as GmailSendException;
      expect(e.gmailError.code).toBe("GMAIL_API_ERROR");
      if (e.gmailError.code === "GMAIL_API_ERROR") {
        expect(e.gmailError.detail).toBe("Service Unavailable");
      }
    }
  });
});

describe("MIME message construction", () => {
  it("encodes subject correctly", async () => {
    await sendGmailReply({ ...BASE_OPTS, subject: "Re: My Test" });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    const decoded = Buffer.from(body.raw, "base64").toString("utf-8");
    expect(decoded).toContain("Subject: Re: My Test");
  });

  it("RFC 2047-encodes a subject with non-ASCII chars (no mojibake)", async () => {
    // "–" (en-dash) + "ó" must NOT appear as raw bytes in the header.
    await sendGmailReply({ ...BASE_OPTS, subject: "Re: Acceso – contraseña" });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    const decoded = Buffer.from(body.raw, "base64").toString("utf-8");
    // Header is an encoded-word, and the raw UTF-8 string is absent from the header line.
    expect(decoded).toContain("Subject: =?UTF-8?B?");
    expect(decoded).not.toContain("Subject: Re: Acceso – contraseña");
  });

  it("leaves a pure-ASCII subject unencoded", async () => {
    await sendGmailReply({ ...BASE_OPTS, subject: "Re: Plain ASCII" });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    const decoded = Buffer.from(body.raw, "base64").toString("utf-8");
    expect(decoded).toContain("Subject: Re: Plain ASCII");
  });

  it("encodes recipient correctly", async () => {
    await sendGmailReply({ ...BASE_OPTS, to: "test@client.com" });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    const decoded = Buffer.from(body.raw, "base64").toString("utf-8");
    expect(decoded).toContain("To: test@client.com");
  });

  it("includes In-Reply-To header when provided", async () => {
    await sendGmailReply({ ...BASE_OPTS, inReplyToMessageId: "<original@gmail.com>" });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    const decoded = Buffer.from(body.raw, "base64").toString("utf-8");
    expect(decoded).toContain("In-Reply-To: <original@gmail.com>");
  });

  it("omits In-Reply-To header when not provided", async () => {
    await sendGmailReply(BASE_OPTS);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    const decoded = Buffer.from(body.raw, "base64").toString("utf-8");
    expect(decoded).not.toContain("In-Reply-To");
  });
});
