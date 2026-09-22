import { describe, it, expect, beforeEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-93 — resolveClassifierContext.
//
// The rule these tests exist to pin is the one that is easy to break by
// accident and expensive to notice: the onboarding stage must not carry the
// business context. Everything else in this file is about a missing value
// degrading quietly instead of failing a classification.
//
// KAI-45 F4 — `language` is the opposite kind of field and both stages read it.
// The business context is an experiment the bench settled per stage; the
// rubric's language is who the tenant is, and tier 1 classifies with a rubric
// like everything else.
// ---------------------------------------------------------------------------

let mailbox = "support@acme.com";
const getGmailEmailByAccountMock = mock(() => Promise.resolve(mailbox));
mock.module("./gmail-token.js", () => ({
  getGmailEmailByAccount: getGmailEmailByAccountMock,
}));

let storedContext: string | null = null;
let storedLanguage: string | null = null;
let storedError: { message: string } | null = null;
let throwOnRead = false;
const maybeSingleMock = mock(() => {
  if (throwOnRead) throw new Error("connection reset");
  return Promise.resolve({
    data: storedError ? null : { business_context: storedContext, language: storedLanguage },
    error: storedError,
  });
});
// KAI-45 — support_channels holds one row per connected mailbox.
let storedChannels: { email_address: string }[] = [];
const channelsResult = () => Promise.resolve({ data: storedChannels, error: null });
const selectMock = mock((_columns: string) => ({
  // accounts: .eq(...).maybeSingle()   support_channels: .eq(...).eq(...) awaited
  eq: () => ({ maybeSingle: maybeSingleMock, eq: channelsResult }),
}));
const fromMock = mock((_table: string) => ({ select: selectMock }));
mock.module("./supabase.js", () => ({ supabase: { from: fromMock } }));

const { buildClassifierBody, resolveClassifierContext, CLASSIFIER_BODY_RULES } =
  await import("./classifier-input.js");

beforeEach(() => {
  mailbox = "support@acme.com";
  storedContext = null;
  storedLanguage = "es";
  storedChannels = [];
  storedError = null;
  throwOnRead = false;
  getGmailEmailByAccountMock.mockClear();
  maybeSingleMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
});

describe("resolveClassifierContext — onboarding", () => {
  it("sends the tenant mailbox and nothing else", async () => {
    storedContext = "Acme Logistics moves freight for pharmacies.";

    const ctx = await resolveClassifierContext("onboarding", "acc-1");

    expect(ctx).toEqual({
      tenantMailbox: "support@acme.com",
      tenantMailboxes: ["support@acme.com"],
      language: "es",
    });
    expect("businessContext" in ctx).toBe(false);
  });

  // It reads the row — it needs the language from it — and still must not
  // carry the context out. Reading and sending are different decisions, and
  // only the second one was ever settled against tier 1.
  it("reads the accounts row for the language but never carries the context", async () => {
    storedContext = "Acme Logistics moves freight for pharmacies.";

    const ctx = await resolveClassifierContext("onboarding", "acc-1");

    expect(fromMock.mock.calls.map((c) => c[0]).sort()).toEqual(["accounts", "support_channels"]);
    expect("businessContext" in ctx).toBe(false);
  });

  it("classifies a tenant against its own rubric", async () => {
    storedLanguage = "en";

    const ctx = await resolveClassifierContext("onboarding", "acc-1");

    expect(ctx.language).toBe("en");
  });

  // An account is not one inbox, and provenance compared against a single
  // address reads the company's own mail as external.
  it("unions every connected mailbox with the resolved one, lowercased and deduped", async () => {
    storedChannels = [
      { email_address: "Support@Acme.com" },
      { email_address: "ops@acme.com" },
      { email_address: "acme.support@gmail.com" },
    ];

    const ctx = await resolveClassifierContext("onboarding", "acc-1");

    expect(ctx.tenantMailboxes).toEqual([
      "support@acme.com",
      "ops@acme.com",
      "acme.support@gmail.com",
    ]);
  });

  // A classification with one mailbox is worth more than none.
  it("falls back to the resolved mailbox when the channels table is unreadable", async () => {
    storedChannels = [];

    const ctx = await resolveClassifierContext("onboarding", "acc-1");

    expect(ctx.tenantMailboxes).toEqual(["support@acme.com"]);
  });
});

describe("resolveClassifierContext — backfill", () => {
  it("carries the business context once the account has one", async () => {
    storedContext = "Acme Logistics moves freight for pharmacies.";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx).toEqual({
      tenantMailbox: "support@acme.com",
      tenantMailboxes: ["support@acme.com"],
      language: "es",
      businessContext: "Acme Logistics moves freight for pharmacies.",
    });
    expect(fromMock).toHaveBeenCalledWith("accounts");
  });

  it("omits the field when the account has no value yet", async () => {
    storedContext = null;

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    // Absent, not empty: the prompt renders `(no disponible)` for an absent
    // field, and an empty string would claim the company does nothing.
    expect(ctx).toEqual({
      tenantMailbox: "support@acme.com",
      tenantMailboxes: ["support@acme.com"],
      language: "es",
    });
  });

  it("treats a whitespace-only value as no value", async () => {
    storedContext = "   \n  ";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx).toEqual({
      tenantMailbox: "support@acme.com",
      tenantMailboxes: ["support@acme.com"],
      language: "es",
    });
  });

  it("trims the stored value", async () => {
    storedContext = "  Freight for pharmacies.\n";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx.businessContext).toBe("Freight for pharmacies.");
  });

  it("still classifies when the column cannot be read", async () => {
    // The realistic case is an environment where the migration adding the
    // column has not been applied yet.
    storedError = { message: 'column accounts.business_context does not exist' };

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx).toEqual({
      tenantMailbox: "support@acme.com",
      tenantMailboxes: ["support@acme.com"],
      language: "es",
    });
  });

  // The CHECK constraint makes this unreachable through the API, so it can only
  // arrive by hand or from a row written before the constraint existed.
  // Honouring it would fail at template load — there is no pt.md — far from the
  // write that caused it, so it is caught here instead.
  it("falls back to the default rubric when the stored language has no template", async () => {
    storedLanguage = "pt";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx.language).toBe("es");
  });

  it("reads the language case-insensitively and trimmed", async () => {
    storedLanguage = "  EN ";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx.language).toBe("en");
  });

  it("still classifies when the read throws", async () => {
    throwOnRead = true;

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx).toEqual({
      tenantMailbox: "support@acme.com",
      tenantMailboxes: ["support@acme.com"],
      language: "es",
    });
  });
});

describe("buildClassifierBody — unchanged by KAI-93 context work", () => {
  it("keeps the two stage rules the eval measures", () => {
    expect(CLASSIFIER_BODY_RULES.onboarding).toEqual({ maxChars: 20_000, stripQuotes: false });
    expect(CLASSIFIER_BODY_RULES.backfill).toEqual({ maxChars: 2_000, stripQuotes: true });
  });

  it("falls back to the snippet when there is no decodable text part", () => {
    expect(buildClassifierBody("onboarding", null, "snippet text")).toBe("snippet text");
  });
});
