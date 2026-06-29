import { describe, it, expect, mock, beforeEach } from "bun:test";
import { ChannelSendException, type ChannelSendErrorCode } from "./types.js";

// ---------------------------------------------------------------------------
// KAI-114: GmailChannelSender — delegates to sendGmailReply and maps Gmail
// error codes onto the provider-agnostic ChannelSendException vocabulary
// (ADR-023 §2 — the worker only ever sees TOKEN_EXPIRED/INSUFFICIENT_SCOPE/
// NO_INTEGRATION/PROVIDER_ERROR, never Gmail-specific codes).
// ---------------------------------------------------------------------------

const sendGmailReplyMock = mock(
  async (): Promise<{ messageId: string; threadId: string; messageIdHeader: string | null }> => ({
    messageId: "msg-123",
    threadId: "thread-abc",
    messageIdHeader: "<sent-msg-123@mail.gmail.com>",
  }),
);

class FakeGmailSendException extends Error {
  readonly gmailError: { code: string; detail?: string };

  constructor(gmailError: { code: string; detail?: string }) {
    super(gmailError.code);
    this.gmailError = gmailError;
  }
}

mock.module("../gmail-send.js", () => ({
  sendGmailReply: sendGmailReplyMock,
  GmailSendException: FakeGmailSendException,
}));

const { GmailChannelSender } = await import("./gmail.js");

const MESSAGE = {
  to: "client@example.com",
  subject: "Re: Support ticket",
  bodyPlain: "Hello, here is our response.",
  threadExternalId: "thread-abc",
};

const CREDENTIAL = { accessToken: "token-xyz", externalAccountId: "agent@kairo.dev" };

beforeEach(() => sendGmailReplyMock.mockClear());

describe("GmailChannelSender — happy path", () => {
  it("delegates to sendGmailReply with the credential and message fields", async () => {
    const sender = new GmailChannelSender();
    await sender.send(MESSAGE, CREDENTIAL);

    expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);
    const [opts] = sendGmailReplyMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(opts.accessToken).toBe("token-xyz");
    expect(opts.threadId).toBe("thread-abc");
    expect(opts.to).toBe("client@example.com");
    expect(opts.subject).toBe("Re: Support ticket");
    expect(opts.bodyPlain).toBe("Hello, here is our response.");
  });

  it("returns a ChannelSendResult mapped from Gmail's response", async () => {
    const sender = new GmailChannelSender();
    const result = await sender.send(MESSAGE, CREDENTIAL);
    expect(result).toEqual({
      providerMessageId: "msg-123",
      providerThreadId: "thread-abc",
      providerMessageIdHeader: "<sent-msg-123@mail.gmail.com>",
    });
  });

  it("passes inReplyToExternalId through to sendGmailReply as inReplyToMessageId (KAI-248 Group 2)", async () => {
    const sender = new GmailChannelSender();
    await sender.send({ ...MESSAGE, inReplyToExternalId: "<original@gmail.com>" }, CREDENTIAL);

    const [opts] = sendGmailReplyMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(opts.inReplyToMessageId).toBe("<original@gmail.com>");
  });

  it("forwards null providerMessageIdHeader when sendGmailReply could not resolve it", async () => {
    sendGmailReplyMock.mockImplementationOnce(async () => ({
      messageId: "msg-456",
      threadId: "thread-abc",
      messageIdHeader: null,
    }));

    const sender = new GmailChannelSender();
    const result = await sender.send(MESSAGE, CREDENTIAL);
    expect(result.providerMessageIdHeader).toBeNull();
  });
});

describe("GmailChannelSender — error code mapping", () => {
  const cases: Array<[string, ChannelSendErrorCode]> = [
    ["GMAIL_TOKEN_EXPIRED", "TOKEN_EXPIRED"],
    ["NO_GMAIL_INTEGRATION", "NO_INTEGRATION"],
    ["INSUFFICIENT_SCOPE", "INSUFFICIENT_SCOPE"],
    ["GMAIL_API_ERROR", "PROVIDER_ERROR"],
  ];

  for (const [gmailCode, channelCode] of cases) {
    it(`maps ${gmailCode} -> ${channelCode}`, async () => {
      sendGmailReplyMock.mockImplementationOnce(() => {
        throw new FakeGmailSendException({ code: gmailCode, detail: "detail text" });
      });

      const sender = new GmailChannelSender();
      try {
        await sender.send(MESSAGE, CREDENTIAL);
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(ChannelSendException);
        expect((err as ChannelSendException).code).toBe(channelCode);
      }
    });
  }

  it("wraps unknown thrown values as PROVIDER_ERROR", async () => {
    sendGmailReplyMock.mockImplementationOnce(() => {
      throw new Error("network blip");
    });

    const sender = new GmailChannelSender();
    try {
      await sender.send(MESSAGE, CREDENTIAL);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(ChannelSendException);
      expect((err as ChannelSendException).code).toBe("PROVIDER_ERROR");
    }
  });
});
