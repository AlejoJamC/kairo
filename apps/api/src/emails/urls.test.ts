import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-245: resolveEmailUrls tests
// AC: help_center_url/status_url/unsubscribe_url -> accounts column or ""
// AC: privacy_url -> accounts column or env.PRIVACY_URL
// AC: ticket_url -> mailto: to tenant Gmail mailbox with [KAIRO-n] token, or ""
// ---------------------------------------------------------------------------

let accountRow: Record<string, unknown> | null = null;

const singleMock = mock(() => Promise.resolve({ data: accountRow, error: null }));
const eqMock = mock(() => ({ single: singleMock }));
const selectMock = mock(() => ({ eq: eqMock }));
const fromMock = mock(() => ({ select: selectMock }));

mock.module("../lib/supabase.js", () => ({
  supabase: { from: fromMock },
}));

let gmailEmail = "";
const getGmailEmailByAccountMock = mock(() => Promise.resolve(gmailEmail));

mock.module("../lib/gmail-token.js", () => ({
  getGmailEmailByAccount: getGmailEmailByAccountMock,
}));

const DEFAULT_PRIVACY_URL = "https://kairo.alejojamc.com/privacy/";

mock.module("../env.js", () => ({
  env: { PRIVACY_URL: DEFAULT_PRIVACY_URL },
}));

const { resolveEmailUrls } = await import("./urls.js");

describe("resolveEmailUrls", () => {
  beforeEach(() => {
    accountRow = null;
    gmailEmail = "";
    singleMock.mockClear();
    eqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
    getGmailEmailByAccountMock.mockClear();
  });

  it("returns accounts columns verbatim when set", async () => {
    accountRow = {
      help_center_url: "https://help.acme.com",
      status_url: "https://status.acme.com",
      privacy_url: "https://acme.com/privacy",
      unsubscribe_url: "https://acme.com/unsubscribe",
    };

    const result = await resolveEmailUrls({
      accountId: "acc-1",
      ticketNumber: 42,
      ticketSubject: "Need help",
    });

    expect(result.help_center_url).toBe("https://help.acme.com");
    expect(result.status_url).toBe("https://status.acme.com");
    expect(result.privacy_url).toBe("https://acme.com/privacy");
    expect(result.unsubscribe_url).toBe("https://acme.com/unsubscribe");
    expect(fromMock).toHaveBeenCalledWith("accounts");
  });

  it("falls back to empty strings for help_center_url/status_url/unsubscribe_url when columns are null", async () => {
    accountRow = {
      help_center_url: null,
      status_url: null,
      privacy_url: null,
      unsubscribe_url: null,
    };

    const result = await resolveEmailUrls({
      accountId: "acc-2",
      ticketNumber: 1,
      ticketSubject: "Hello",
    });

    expect(result.help_center_url).toBe("");
    expect(result.status_url).toBe("");
    expect(result.unsubscribe_url).toBe("");
  });

  it("falls back to env.PRIVACY_URL when accounts.privacy_url is null", async () => {
    accountRow = {
      help_center_url: null,
      status_url: null,
      privacy_url: null,
      unsubscribe_url: null,
    };

    const result = await resolveEmailUrls({
      accountId: "acc-3",
      ticketNumber: 1,
      ticketSubject: "Hello",
    });

    expect(result.privacy_url).toBe(DEFAULT_PRIVACY_URL);
  });

  it("resolves ticket_url to a mailto: with the [KAIRO-n] token when a Gmail mailbox is connected", async () => {
    accountRow = {
      help_center_url: null,
      status_url: null,
      privacy_url: null,
      unsubscribe_url: null,
    };
    gmailEmail = "support@acme.com";

    const result = await resolveEmailUrls({
      accountId: "acc-4",
      ticketNumber: 99,
      ticketSubject: "Order issue",
    });

    const expectedSubject = encodeURIComponent("Re: Order issue [KAIRO-99]");
    expect(result.ticket_url).toBe(`mailto:support@acme.com?subject=${expectedSubject}`);
  });

  it("resolves ticket_url to an empty string when no Gmail mailbox is connected", async () => {
    accountRow = {
      help_center_url: null,
      status_url: null,
      privacy_url: null,
      unsubscribe_url: null,
    };
    gmailEmail = "";

    const result = await resolveEmailUrls({
      accountId: "acc-5",
      ticketNumber: 1,
      ticketSubject: "Hello",
    });

    expect(result.ticket_url).toBe("");
  });
});
