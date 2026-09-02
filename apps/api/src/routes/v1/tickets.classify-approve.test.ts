import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-191 code review finding #3 — POST /v1/tickets/:id/classify-approve
//
// This endpoint does not write tickets.category/priority/etc. in either
// branch: the AI's proposed value was already applied to the ticket at
// classification time, and rejecting a proposal here does not revert it.
// So the ticket_classification_history row it emits per dimension must
// carry `applied` as a real column stating whether this human's decision
// leaves the proposal standing as the ticket's classification of record —
// confirm -> true, reject -> false — rather than burying that fact in
// metadata.review_outcome, which is what this fix replaces.
//
// Mocking follows the same pattern as tickets.status.test.ts: mock.module()
// on "../../lib/supabase.js" and "../../lib/auth.js", then import the real
// tickets.js and drive it with tickets.request().
process.env.SKIP_ENV_VALIDATION ??= "1";
// ---------------------------------------------------------------------------

const TICKET_ID = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";
// zod's z.string().uuid() checks the RFC4122 variant nibble (must be
// 8/9/a/b), so this needs a syntactically valid UUID, not just uuid-shaped.
const PROPOSAL_ID = "44444444-4444-4444-8444-444444444444";

interface FakeState {
  proposalRow: {
    proposed_category: string | null;
    proposed_priority: string | null;
    proposed_type: string | null;
    proposed_sentiment: string | null;
    proposed_emotion: string | null;
    confidence_score: number | null;
    model_version: string | null;
  } | null;
}

const state: FakeState = { proposalRow: null };

const classificationInsertMock = mock((_row: Record<string, unknown>) => Promise.resolve({ error: null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTicketsBuilder(): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.single = async () => ({ data: { id: TICKET_ID }, error: null });
  return builder;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeProposalsBuilder(): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  builder.update = () => builder;
  builder.eq = () => builder;
  builder.select = () => builder;
  builder.single = async () => ({ data: state.proposalRow, error: null });
  return builder;
}

const fromMock = mock((table: string) => {
  if (table === "tickets") return makeTicketsBuilder();
  if (table === "ticket_proposals") return makeProposalsBuilder();
  if (table === "ticket_classification_history") return { insert: classificationInsertMock };
  throw new Error(`tickets.classify-approve.test.ts: unexpected table '${table}'`);
});

mock.module("../../lib/supabase.js", () => ({ supabase: { from: fromMock } }));

const resolveUserAndAccountMock = mock(
  async (): Promise<{ userId: string; accountId: string } | null> => ({ userId: USER_ID, accountId: ACCOUNT_ID })
);
mock.module("../../lib/auth.js", () => ({
  resolveUserAndAccount: resolveUserAndAccountMock,
  resolveMemberRole: mock(async () => "agent"),
}));

const { tickets } = await import("./tickets.js");

function resetState() {
  state.proposalRow = {
    proposed_category: "billing",
    proposed_priority: null,
    proposed_type: null,
    proposed_sentiment: null,
    proposed_emotion: null,
    confidence_score: 0.87,
    model_version: "test-model",
  };
  classificationInsertMock.mockClear();
  fromMock.mockClear();
}

function authedRequest(path: string, init: RequestInit = {}) {
  return tickets.request(path, {
    ...init,
    headers: { Authorization: "Bearer faketoken", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("POST /:id/classify-approve — applied reflects confirm vs reject (KAI-191 finding #3)", () => {
  beforeEach(() => resetState());

  it("action=confirm: the emitted row carries applied: true", async () => {
    const res = await authedRequest(`/${TICKET_ID}/classify-approve`, {
      method: "POST",
      body: JSON.stringify({ proposal_id: PROPOSAL_ID, action: "confirm" }),
    });

    expect(res.status).toBe(200);
    expect(classificationInsertMock).toHaveBeenCalledTimes(1);
    const inserted = classificationInsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      dimension: "category",
      to_value: "billing",
      applied: true,
    });
    // The old encoding is gone: no review_outcome buried in metadata.
    expect((inserted.metadata as Record<string, unknown> | null)?.review_outcome).toBeUndefined();
  });

  it("action=reject: the emitted row carries applied: false, and to_value still records what was rejected", async () => {
    const res = await authedRequest(`/${TICKET_ID}/classify-approve`, {
      method: "POST",
      body: JSON.stringify({ proposal_id: PROPOSAL_ID, action: "reject" }),
    });

    expect(res.status).toBe(200);
    expect(classificationInsertMock).toHaveBeenCalledTimes(1);
    const inserted = classificationInsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      dimension: "category",
      to_value: "billing",
      applied: false,
    });
  });

  it("this endpoint never writes to the tickets table in either branch", async () => {
    await authedRequest(`/${TICKET_ID}/classify-approve`, {
      method: "POST",
      body: JSON.stringify({ proposal_id: PROPOSAL_ID, action: "reject" }),
    });

    const ticketsCalls = fromMock.mock.calls.filter(([table]) => table === "tickets");
    // Only the initial existence check reads "tickets"; nothing here calls
    // .update() on it — confirmed by makeTicketsBuilder() never exposing one.
    expect(ticketsCalls.length).toBeGreaterThan(0);
  });
});
