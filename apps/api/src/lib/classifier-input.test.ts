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
let storedIndustry: string | null = null;
let storedError: { message: string } | null = null;
let throwOnRead = false;
const maybeSingleMock = mock(() => {
  if (throwOnRead) throw new Error("connection reset");
  return Promise.resolve({
    data: storedError ? null : { business_context: storedContext, language: storedLanguage, industry: storedIndustry },
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
// The business profile the owner approved, read only when no description is written.
let storedProfile: string | null = null;
const profileChain = { eq: () => profileChain, maybeSingle: () => Promise.resolve({ data: storedProfile === null ? null : { summary: storedProfile }, error: null }) };
const fromMock = mock((table: string) => table === "operational_learning" ? { select: () => profileChain } : { select: selectMock });
mock.module("./supabase.js", () => ({ supabase: { from: fromMock } }));

const { loadPreviousCase, buildClassifierBody, buildEmailClassifierInput, resolveClassifierContext, CLASSIFIER_BODY_RULES } =
  await import("./classifier-input.js");

beforeEach(() => {
  mailbox = "support@acme.com";
  storedContext = null;
  storedProfile = null;
  storedLanguage = "es";
  storedIndustry = null;
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

describe('previous case context', () => {
  it('scopes the existing case to the account and integration and excludes merged tickets', async () => {
    const filters: unknown[][] = [];
    const prior = {id:'ticket',status:'open',model_verdict:{priority:'P2'},assigned_to:'agent'};
    const db = {from:(table:string) => {
      const chain = {select:()=>chain,eq:(...args:unknown[])=>{filters.push([table,...args]);return chain;},
        is:(...args:unknown[])=>{filters.push([table,...args]);return chain;},
        maybeSingle:async()=>({data:table === 'conversations' ? {id:'conversation'} : prior,error:null})};
      return chain;
    }} as unknown as NonNullable<Parameters<typeof loadPreviousCase>[3]>;
    expect(await loadPreviousCase('account','integration','thread',db)).toEqual(prior);
    expect(filters).toContainEqual(['conversations','channel_integration_id','integration']);
    expect(filters).toContainEqual(['conversations','external_thread_id','thread']);
    expect(filters).toContainEqual(['tickets','account_id','account']);
    expect(filters).toContainEqual(['tickets','merged_into_ticket_id',null]);
  });
  it('distinguishes a new case from a failed context read', async () => {
    for (const error of [null,{message:'unavailable'}]) {
      const chain = {select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:null,error})};
      const db = {from:()=>chain} as unknown as NonNullable<Parameters<typeof loadPreviousCase>[3]>;
      const result = loadPreviousCase('account','integration','thread',db);
      if(error) await expect(result).rejects.toThrow('Previous conversation unavailable');
      else expect(await result).toEqual({status:'new_case'});
    }
  });
});

describe("resolveClassifierContext — approved business profile", () => {
  it("uses the approved profile when no description is written", async () => {
    storedProfile = "Acme delivers support software to small companies.";
    const ctx = await resolveClassifierContext("backfill", "acc-1");
    expect(ctx.businessContext).toBe("Acme delivers support software to small companies.");
  });

  it("keeps a written description over the profile", async () => {
    storedContext = "Acme Logistics moves freight for pharmacies.";
    storedProfile = "Acme delivers support software to small companies.";
    const ctx = await resolveClassifierContext("backfill", "acc-1");
    expect(ctx.businessContext).toBe("Acme Logistics moves freight for pharmacies.");
  });

  it("never carries the profile into onboarding", async () => {
    storedProfile = "Acme delivers support software to small companies.";
    const ctx = await resolveClassifierContext("onboarding", "acc-1");
    expect("businessContext" in ctx).toBe(false);
  });
});

describe("resolveClassifierContext — industry", () => {
  it("adds how the industry reads each ticket type, in the account language, next to the business context", async () => {
    storedIndustry = "legal";
    storedContext = "Acme Legal advises families.";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx.businessContext).toBe("Acme Legal advises families.");
    expect(ctx.industryGuidance).toContain("Derecho");
    expect(ctx.industryGuidance).toContain("- support: Estado del caso; Documentación y evidencias");
    expect(ctx.industryGuidance).toContain("- prospect: Familiar; Laboral; Penal");
  });

  it("reads the default industry when the owner picked other", async () => {
    storedIndustry = "other";
    storedLanguage = "en";

    const ctx = await resolveClassifierContext("backfill", "acc-1");

    expect(ctx.industryGuidance).toContain("Customer service");
    expect(ctx.industryGuidance).toContain("- support: Order status");
    expect(ctx.businessContext).toBeUndefined();
  });

  it("leaves accounts without an industry as they were", async () => {
    storedIndustry = null;
    expect((await resolveClassifierContext("backfill", "acc-1")).industryGuidance).toBeUndefined();
  });

  it("keeps the industry out of the onboarding stage", async () => {
    storedIndustry = "financial";
    const ctx = await resolveClassifierContext("onboarding", "acc-1");
    expect(ctx).not.toHaveProperty("industryGuidance");
  });

  it("gives the classifier the guidance without counting it as the business description", async () => {
    storedIndustry = "technology";
    const context = await resolveClassifierContext("backfill", "acc-1");
    const message = buildEmailClassifierInput({
      stage: "backfill", subject: "s", from: "a@outside.com", bodyPlain: "body", facts: {} as never, context,
    });
    expect(message.businessContext).toBe(context.industryGuidance);
    expect(message.evidence?.missing).toContain("business_context");
  });
});
