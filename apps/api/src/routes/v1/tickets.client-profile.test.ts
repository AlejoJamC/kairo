import { describe, it, expect, mock, beforeEach } from "bun:test";

// GET /v1/tickets/:id/client-profile falls back to the draft contact when the
// ticket has no client linked. tickets.from_email can hold the whole header
// ("Name <address>"), while drafts are keyed by the bare normalized address.
// Mocking strategy follows tickets.status.test.ts.
process.env.SKIP_ENV_VALIDATION ??= "1";

const TICKET_ID = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";
const DRAFT_ID = "44444444-4444-4444-4444-444444444444";

const state: {
  fromEmail: string | null;
  drafts: Record<string, { id: string; email: string; status: string }>;
  emailLookups: string[];
} = { fromEmail: null, drafts: {}, emailLookups: [] };

function ticketBuilder() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  b.select = () => b;
  b.eq = () => b;
  b.single = async () => ({ data: { id: TICKET_ID, client_id: null, from_email: state.fromEmail }, error: null });
  return b;
}

function draftBuilder() {
  let email = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  b.select = () => b;
  b.eq = (column: string, value: string) => {
    if (column === "email") { email = value; state.emailLookups.push(value); }
    return b;
  };
  b.in = () => b;
  b.maybeSingle = async () => {
    const draft = state.drafts[email];
    return {
      data: draft ? { ...draft, phone: null, display_name: "Ana", organization: "acme.com", evidence_count: 2, first_seen_at: "2026-01-01T00:00:00Z" } : null,
      error: null,
    };
  };
  return b;
}

mock.module("../../lib/supabase.js", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "tickets") return ticketBuilder();
      if (table === "draft_contact") return draftBuilder();
      throw new Error(`tickets.client-profile.test.ts: unexpected table '${table}'`);
    },
  },
}));

mock.module("../../lib/auth.js", () => ({
  resolveUserAndAccount: async () => ({ userId: USER_ID, accountId: ACCOUNT_ID }),
  resolveMemberRole: async () => "agent",
}));

const { tickets } = await import("./tickets.js");

const get = () => tickets.request(`/${TICKET_ID}/client-profile`, { headers: { Authorization: "Bearer faketoken" } });

describe("GET /v1/tickets/:id/client-profile — draft fallback", () => {
  beforeEach(() => {
    state.fromEmail = null;
    state.drafts = { "ana@acme.com": { id: DRAFT_ID, email: "ana@acme.com", status: "proposed" } };
    state.emailLookups = [];
  });

  it("finds the draft when from_email holds the whole header", async () => {
    state.fromEmail = "Ana Perez <Ana@Acme.com>";
    const res = await get();
    expect(res.status).toBe(200);
    expect(state.emailLookups).toEqual(["ana@acme.com"]);
    const body = await res.json() as { draftId: string; source: string };
    expect(body.draftId).toBe(DRAFT_ID);
    expect(body.source).toBe("draft");
  });

  it("finds the draft when from_email is a bare address in any case", async () => {
    state.fromEmail = "ANA@acme.com";
    expect((await get()).status).toBe(200);
  });

  it("answers 404 when there is no draft for that sender", async () => {
    state.fromEmail = "Someone <someone@outside.com>";
    expect((await get()).status).toBe(404);
  });

  it("answers 404 when the ticket has no sender", async () => {
    state.fromEmail = null;
    expect((await get()).status).toBe(404);
  });
});
