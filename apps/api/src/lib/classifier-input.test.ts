import { describe, it, expect, beforeEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-93 — resolveClassifierContext.
//
// The rule these tests exist to pin is the one that is easy to break by
// accident and expensive to notice: the onboarding stage must not carry the
// business context, and must not even go looking for it. Everything else in
// this file is about a missing value degrading quietly instead of failing a
// classification.
// ---------------------------------------------------------------------------

let mailbox = "support@acme.com";
const getGmailEmailByAccountMock = mock(() => Promise.resolve(mailbox));
mock.module("./gmail-token.js", () => ({
  getGmailEmailByAccount: getGmailEmailByAccountMock,
}));

let storedContext: string | null = null;
let storedError: { message: string } | null = null;
let throwOnRead = false;
const maybeSingleMock = mock(() => {
  if (throwOnRead) throw new Error("connection reset");
  return Promise.resolve({
    data: storedError ? null : { business_context: storedContext },
    error: storedError,
  });
});
const selectMock = mock((_columns: string) => ({
  eq: () => ({ maybeSingle: maybeSingleMock }),
}));
const fromMock = mock((_table: string) => ({ select: selectMock }));
mock.module("./supabase.js", () => ({ supabase: { from: fromMock } }));

const { buildClassifierBody, resolveClassifierContext, CLASSIFIER_BODY_RULES } =
  await import("./classifier-input.js");

beforeEach(() => {
  mailbox = "support@acme.com";
  storedContext = null;
  storedError = null;
  throwOnRead = false;
  getGmailEmailByAccountMock.mockClear();
  maybeSingleMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
});

describe("resolveClassifierContext — onboarding", () => {
  it("sends the tenant mailbox and nothing else", async () => {
    storedContext = "Encarga SAS moves freight for pharmacies.";

    const ctx = await resolveClassifierContext("onboarding", "acc-1");

    expect(ctx).toEqual({ tenantMailbox: "support@acme.com" });
    expect("businessContext" in ctx).toBe(false);
  });

  it("does not read the column at all", async () => {
    storedContext = "Encarga SAS moves freight for pharmacies.";

    await resolveClassifierContext("onboarding", "acc-1");

    // Tier 1 runs before any value could exist, and the bench measured the
    // field as harmful in that column. Not sending it is the rule; not paying
    // for the read is the consequence.
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("resolveClassifierContext — backfill", () => {
  it("carries the business context once the account has one", async () => {
    storedContext = "Encarga SAS moves freight for pharmacies.";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx).toEqual({
      tenantMailbox: "support@acme.com",
      businessContext: "Encarga SAS moves freight for pharmacies.",
    });
    expect(fromMock).toHaveBeenCalledWith("accounts");
  });

  it("omits the field when the account has no value yet", async () => {
    storedContext = null;

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    // Absent, not empty: the prompt renders `(no disponible)` for an absent
    // field, and an empty string would claim the company does nothing.
    expect(ctx).toEqual({ tenantMailbox: "support@acme.com" });
  });

  it("treats a whitespace-only value as no value", async () => {
    storedContext = "   \n  ";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx).toEqual({ tenantMailbox: "support@acme.com" });
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

    expect(ctx).toEqual({ tenantMailbox: "support@acme.com" });
  });

  it("still classifies when the read throws", async () => {
    throwOnRead = true;

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx).toEqual({ tenantMailbox: "support@acme.com" });
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
