import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-191 — GET /v1/tickets/:id/lifecycle
//
// Mocks "../../lib/auth.js" (resolveUserAndAccount / resolveMemberRole) and
// "../../lib/supabase.js" so the route runs against fakes instead of a real
// DB, following the mock.module() convention from ticket-events.test.ts and
// the chainable-builder convention from out-of-hours-reply.test.ts.
//
// tickets.ts also imports "../../env.js" (-> @kairo/env) at module scope,
// which validates real Supabase/Anthropic env vars eagerly. Bun's test
// runner (NODE_ENV=test) intentionally does not load .env.local, so those
// vars aren't present here; skip that validation rather than mock env.js
// itself, since nothing in the lifecycle route touches env values.
process.env.SKIP_ENV_VALIDATION ??= "1";
// ---------------------------------------------------------------------------

const TICKET_ID = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";

interface FakeState {
  ticket: { id: string; status: string } | null;
  ticketError: { message: string } | null;
  timeline: unknown[];
  durations: unknown[];
  role: string | null;
}

const state: FakeState = {
  ticket: { id: TICKET_ID, status: "resolved" },
  ticketError: null,
  timeline: [],
  durations: [],
  role: "agent",
};

function makeListBuilder(getResult: () => { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(getResult()).then(resolve, reject);
  return builder;
}

function makeSingleBuilder(getResult: () => { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.single = async () => getResult();
  return builder;
}

const fromMock = mock((table: string) => {
  if (table === "tickets") {
    return makeSingleBuilder(() => ({ data: state.ticket, error: state.ticketError }));
  }
  if (table === "ticket_state_history") {
    return makeListBuilder(() => ({ data: state.timeline, error: null }));
  }
  if (table === "ticket_state_durations") {
    return makeListBuilder(() => ({ data: state.durations, error: null }));
  }
  throw new Error(`tickets.lifecycle.test.ts: unexpected table '${table}'`);
});

mock.module("../../lib/supabase.js", () => ({
  supabase: { from: fromMock },
}));

const resolveUserAndAccountMock = mock(
  async (): Promise<{ userId: string; accountId: string } | null> => ({ userId: USER_ID, accountId: ACCOUNT_ID })
);
const resolveMemberRoleMock = mock(async () => state.role);

mock.module("../../lib/auth.js", () => ({
  resolveUserAndAccount: resolveUserAndAccountMock,
  resolveMemberRole: resolveMemberRoleMock,
}));

const { tickets } = await import("./tickets.js");
const { getAllowedTransitionsForRole } = await import("../../lib/ticket-status-machine.js");

function resetState() {
  state.ticket = { id: TICKET_ID, status: "resolved" };
  state.ticketError = null;
  state.timeline = [
    {
      from_state: "open",
      to_state: "resolved",
      actor_type: "human",
      actor_ref: null,
      trigger: "manual_status_change",
      reason: null,
      occurred_at: "2026-08-30T10:00:00Z",
    },
  ];
  state.durations = [
    { state: "open", entered_at: "2026-08-29T10:00:00Z", exited_at: "2026-08-30T10:00:00Z", duration: "1 day" },
    { state: "resolved", entered_at: "2026-08-30T10:00:00Z", exited_at: null, duration: null },
  ];
  state.role = "agent";
}

describe("GET /v1/tickets/:id/lifecycle", () => {
  beforeEach(() => {
    resetState();
    fromMock.mockClear();
    resolveUserAndAccountMock.mockClear();
    resolveMemberRoleMock.mockClear();
  });

  it("returns the full lifecycle shape for a ticket the caller's account owns", async () => {
    const res = await tickets.request(`/${TICKET_ID}/lifecycle`, {
      headers: { Authorization: "Bearer faketoken" },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ticket_id).toBe(TICKET_ID);
    expect(body.current_state).toBe("resolved");
    expect(body.current_state_since).toBe("2026-08-30T10:00:00Z");
    expect(typeof body.current_state_duration).toBe("string");
    expect(body.timeline).toEqual(state.timeline);
    expect(body.durations_by_state).toEqual(state.durations);
    expect(Array.isArray(body.allowed_transitions)).toBe(true);
  });

  it("allowed_transitions reflects the caller's role via getAllowedTransitionsForRole", async () => {
    state.role = "agent";
    const res = await tickets.request(`/${TICKET_ID}/lifecycle`, {
      headers: { Authorization: "Bearer faketoken" },
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.allowed_transitions).toEqual(getAllowedTransitionsForRole("resolved", "agent"));
    // 'closed' is never reachable through the API regardless of role.
    expect(body.allowed_transitions).not.toContain("closed");
  });

  it("returns an empty allowed_transitions when the caller has no active role on the account", async () => {
    state.role = null;
    const res = await tickets.request(`/${TICKET_ID}/lifecycle`, {
      headers: { Authorization: "Bearer faketoken" },
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.allowed_transitions).toEqual([]);
  });

  it("returns 404 when the ticket does not belong to the caller's account", async () => {
    state.ticket = null;
    state.ticketError = { message: "not found" };
    const res = await tickets.request(`/${TICKET_ID}/lifecycle`, {
      headers: { Authorization: "Bearer faketoken" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    resolveUserAndAccountMock.mockImplementationOnce(async () => null);
    const res = await tickets.request(`/${TICKET_ID}/lifecycle`, {
      headers: { Authorization: "Bearer faketoken" },
    });
    expect(res.status).toBe(401);
  });
});
