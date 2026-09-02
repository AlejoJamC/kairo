import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-191 — PATCH /v1/tickets/:id/status and POST /v1/tickets/:id/escalate
//
// Both endpoints must write tickets.status exclusively through
// transitionTicketStatus(), which calls client.rpc("apply_ticket_transition",
// ...) — see ./ticket-transition.js. These tests fake that RPC response on
// the mock client's .rpc(), following the same mocking strategy as
// tickets.lifecycle.test.ts (mock.module() on "../../lib/supabase.js" and
// "../../lib/auth.js", then import the real tickets.js and drive it with
// tickets.request()). "./ticket-transition.js" itself is never mocked —
// mock.module() is process-wide in bun:test and other files (e.g.
// ticket-transition.test.ts) need the real implementation; see the header
// comment in ticket-thread-transitions.test.ts for the full rationale.
//
// PATCH /:id/status and POST /:id/escalate both route the legality/role
// check through checkTransitionPermission() (../../lib/ticket-transition-
// permission.js) BEFORE ever calling transitionTicketStatus(). An illegal
// transition is therefore rejected at that pre-check — 422 — and the RPC is
// never invoked at all; the RPC's own invalid_transition/no_op outcomes are
// a second, race-safe layer behind it, not the layer these tests exercise
// for the illegal-transition case.
process.env.SKIP_ENV_VALIDATION ??= "1";
// ---------------------------------------------------------------------------

const TICKET_ID = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";

interface FakeState {
  ticket: { id: string; status: string } | null;
  ticketError: { message: string } | null;
  updatedTicket: { id: string; status: string } | null;
  role: string | null;
  rpcResult: { data: unknown; error: unknown };
}

const state: FakeState = {
  ticket: { id: TICKET_ID, status: "open" },
  ticketError: null,
  updatedTicket: null,
  role: "agent",
  rpcResult: { data: [{ outcome: "applied", from_state: "open", to_state: "in_progress", history_id: "hist-1" }], error: null },
};

// tickets.ts fetches the ticket once for the pre-check (fromStatus), then —
// only when transitionTicketStatus() reports "applied" — refetches it to
// return the post-transition row. Modeling that as call-count-aware keeps
// the fake simple: first .single() resolves the pre-transition row, every
// call after resolves the post-transition one.
let ticketFetchCount = 0;

function makeTicketBuilder() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.single = async () => {
    ticketFetchCount++;
    if (ticketFetchCount === 1) return { data: state.ticket, error: state.ticketError };
    return { data: state.updatedTicket ?? state.ticket, error: null };
  };
  return builder;
}

const activityInsertMock = mock(async () => ({ error: null }));

const fromMock = mock((table: string) => {
  if (table === "tickets") return makeTicketBuilder();
  if (table === "ticket_activity_log") return { insert: activityInsertMock };
  throw new Error(`tickets.status.test.ts: unexpected table '${table}'`);
});

const rpcMock = mock(async (_fn: string, _args: Record<string, unknown>) => state.rpcResult);

mock.module("../../lib/supabase.js", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
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

function resetState() {
  state.ticket = { id: TICKET_ID, status: "open" };
  state.ticketError = null;
  state.updatedTicket = null;
  state.role = "agent";
  state.rpcResult = {
    data: [{ outcome: "applied", from_state: "open", to_state: "in_progress", history_id: "hist-1" }],
    error: null,
  };
  ticketFetchCount = 0;
  fromMock.mockClear();
  rpcMock.mockClear();
  activityInsertMock.mockClear();
  resolveUserAndAccountMock.mockClear();
  resolveMemberRoleMock.mockClear();
}

function authedRequest(path: string, init: RequestInit = {}) {
  return tickets.request(path, {
    ...init,
    headers: { Authorization: "Bearer faketoken", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("PATCH /v1/tickets/:id/status", () => {
  beforeEach(() => resetState());

  it("legal transition: calls apply_ticket_transition via the RPC with the expected args, and the response reflects the applied transition", async () => {
    state.ticket = { id: TICKET_ID, status: "open" };
    state.updatedTicket = { id: TICKET_ID, status: "in_progress" };
    state.rpcResult = {
      data: [{ outcome: "applied", from_state: "open", to_state: "in_progress", history_id: "hist-1" }],
      error: null,
    };

    const res = await authedRequest(`/${TICKET_ID}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.ticket as { status: string }).status).toBe("in_progress");

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fnName).toBe("apply_ticket_transition");
    expect(args).toMatchObject({
      p_ticket_id: TICKET_ID,
      p_to_state: "in_progress",
      p_trigger: "manual_status_change",
      p_actor_type: "human",
    });
  });

  it("illegal transition: rejected before the RPC by checkTransitionPermission (INVALID_TRANSITION), 4xx response, RPC never called", async () => {
    // resolved -> awaiting_customer is not in ALLOWED_TRANSITIONS.resolved.
    state.ticket = { id: TICKET_ID, status: "resolved" };

    const res = await authedRequest(`/${TICKET_ID}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "awaiting_customer" }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("INVALID_TRANSITION");

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RPC reports no_op (a race landed the ticket on the target state already): 200, not INVALID_TRANSITION (code review finding #1)", async () => {
    // checkTransitionPermission() only sees fromStatus = 'open' (the read
    // above), so it treats open -> in_progress as legal and lets the RPC
    // run. This models the RPC's own fresh read finding the ticket already
    // at in_progress by the time it runs — a narrow but real race, not
    // reachable by passing status === current status directly (that is
    // rejected by checkTransitionPermission before the RPC is ever called,
    // see the illegal-transition test above).
    state.ticket = { id: TICKET_ID, status: "open" };
    state.updatedTicket = { id: TICKET_ID, status: "in_progress" };
    state.rpcResult = {
      data: [{ outcome: "no_op", from_state: "in_progress", to_state: "in_progress", history_id: null }],
      error: null,
    };

    const res = await authedRequest(`/${TICKET_ID}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress" }),
    });

    // no_op means the ticket is already at the requested state — that is
    // success from the caller's point of view, not INVALID_TRANSITION.
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).not.toBe("INVALID_TRANSITION");
    expect((body.ticket as { status: string }).status).toBe("in_progress");
  });
});

describe("POST /v1/tickets/:id/escalate", () => {
  beforeEach(() => resetState());

  it("legal transition: calls apply_ticket_transition with p_trigger: 'escalate_action'", async () => {
    state.ticket = { id: TICKET_ID, status: "open" };
    state.updatedTicket = { id: TICKET_ID, status: "escalated" };
    state.rpcResult = {
      data: [{ outcome: "applied", from_state: "open", to_state: "escalated", history_id: "hist-2" }],
      error: null,
    };

    const res = await authedRequest(`/${TICKET_ID}/escalate`, {
      method: "POST",
      body: JSON.stringify({ reason: "customer is furious" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.escalated).toBe(true);
    expect((body.ticket as { status: string } | null)?.status).toBe("escalated");

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fnName).toBe("apply_ticket_transition");
    expect(args).toMatchObject({
      p_ticket_id: TICKET_ID,
      p_to_state: "escalated",
      p_trigger: "escalate_action",
      p_actor_type: "human",
    });
  });

  it("already escalated: no-op, RPC never called, response still 2xx with escalated: true", async () => {
    state.ticket = { id: TICKET_ID, status: "escalated" };

    const res = await authedRequest(`/${TICKET_ID}/escalate`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.escalated).toBe(true);
    expect(body.ticket).toBe(null);

    expect(rpcMock).not.toHaveBeenCalled();
    // The escalation activity log is still recorded even on this no-op path.
    expect(activityInsertMock).toHaveBeenCalledTimes(1);
  });

  it("escalation illegal from this state (resolved -> escalated is blocked): no-op, RPC never called", async () => {
    state.ticket = { id: TICKET_ID, status: "resolved" };

    const res = await authedRequest(`/${TICKET_ID}/escalate`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.escalated).toBe(true);
    expect(body.ticket).toBe(null);

    expect(rpcMock).not.toHaveBeenCalled();
  });
});
