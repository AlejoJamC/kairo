import { describe, it, expect, mock } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-165: ticket-thread-transitions.ts unit tests
// KAI-191: the actual status write now goes through the real
// transitionTicketStatus(), which calls client.rpc("apply_ticket_transition",
// ...) — faked here on the mock client's .rpc(), not by mocking the
// "./ticket-transition.js" module. mock.module() is process-wide in
// bun:test, and ticket-transition.test.ts needs the real implementation, so
// no file may replace that module. The defensive "write anyway for an
// unknown state" fallback has also been removed from applyCustomerReplyTransition.
//
// KAI-191: applyCustomerReplyTransition no longer emits customer_replied —
// it was a pointer event duplicating a fact `messages` already holds.
// Nothing replaces it, so there is no emission to mock or assert on here
// anymore; these tests only exercise the status-transition behavior.
//
// KAI-191 decision 3: a reply on a 'closed' ticket has no candidate
// transition and never reaches transitionTicketStatus() at all, so it is
// recorded via emitTicketActivity() instead — which reads the module-level
// `supabase` singleton from ./supabase.js, not the mock `client` parameter.
// Mocked the same way out-of-hours-reply.test.ts and ticket-events.test.ts
// already mock that module.
// ---------------------------------------------------------------------------

const activityInsertMock = mock((_row: Record<string, unknown>): Promise<{ error: { message: string } | null }> => Promise.resolve({ error: null }));
const activityFromMock = mock(() => ({ insert: activityInsertMock }));
mock.module("./supabase.js", () => ({
  supabase: { from: activityFromMock },
}));

const { applyCustomerReplyTransition } = await import("./ticket-thread-transitions.js");

function makeMockClient({
  updateError = null as unknown,
  rpcResult = { data: [{ outcome: "applied", from_state: "awaiting_customer", to_state: "open", history_id: "hist-1" }], error: null } as {
    data: unknown;
    error: unknown;
  },
  accountIdRow = { account_id: "acct-closed-1" } as { account_id: string } | null,
} = {}) {
  const eqFn = mock(async () => ({ error: updateError }));
  // chain: .from("tickets").select("account_id").eq("id", id).maybeSingle() —
  // used only by the 'closed' branch to resolve account_id for emitTicketActivity.
  const maybeSingleFn = mock(async () => ({ data: accountIdRow, error: null }));
  const selectEqFn = mock(() => ({ maybeSingle: maybeSingleFn }));
  const selectFn = mock(() => ({ eq: selectEqFn }));
  // chain: .from("tickets").update({}).eq("id", id)
  const fromFn = mock(() => ({
    update: mock(() => ({ eq: eqFn })),
    select: selectFn,
  }));
  const rpcFn = mock(async (_fnName: string, _args: Record<string, unknown>) => rpcResult);
  return {
    from: fromFn,
    rpc: rpcFn,
    _eqFn: eqFn,
    _rpcFn: rpcFn,
    _selectFn: selectFn,
    _maybeSingleFn: maybeSingleFn,
  } as unknown as Parameters<typeof applyCustomerReplyTransition>[0] & {
    _eqFn: typeof eqFn;
    _rpcFn: typeof rpcFn;
    _selectFn: typeof selectFn;
    _maybeSingleFn: typeof maybeSingleFn;
  };
}

describe("applyCustomerReplyTransition", () => {
  it("transitions awaiting_customer → open via transitionTicketStatus", async () => {
    const client = makeMockClient({
      rpcResult: { data: [{ outcome: "applied", from_state: "awaiting_customer", to_state: "open", history_id: "hist-1" }], error: null },
    });
    const result = await applyCustomerReplyTransition(client, "ticket-1", "awaiting_customer");
    expect(result.newStatus).toBe("open");

    expect(client._rpcFn).toHaveBeenCalledTimes(1);
    const [fnName, args] = client._rpcFn.mock.calls[0];
    expect(fnName).toBe("apply_ticket_transition");
    expect(args).toMatchObject({
      p_ticket_id: "ticket-1",
      p_to_state: "open",
      p_actor_type: "customer",
      p_trigger: "customer_reply",
    });
  });

  it("transitions resolved → reopened via transitionTicketStatus", async () => {
    const client = makeMockClient({
      rpcResult: { data: [{ outcome: "applied", from_state: "resolved", to_state: "reopened", history_id: "hist-2" }], error: null },
    });
    const result = await applyCustomerReplyTransition(client, "ticket-2", "resolved");
    expect(result.newStatus).toBe("reopened");
  });

  it("does not transition for open status — no RPC call at all", async () => {
    const client = makeMockClient();
    const result = await applyCustomerReplyTransition(client, "ticket-3", "open");
    expect(result.newStatus).toBeNull();
    expect(client._rpcFn).not.toHaveBeenCalled();
  });

  it("does not transition for in_progress status — no RPC call at all", async () => {
    const client = makeMockClient();
    const result = await applyCustomerReplyTransition(client, "ticket-4", "in_progress");
    expect(result.newStatus).toBeNull();
    expect(client._rpcFn).not.toHaveBeenCalled();
  });

  it("does not transition for null prior status — no RPC call at all", async () => {
    const client = makeMockClient();
    const result = await applyCustomerReplyTransition(client, "ticket-5", null);
    expect(result.newStatus).toBeNull();
    expect(client._rpcFn).not.toHaveBeenCalled();
  });

  it("does not write when the transition comes back no_op — no fallback write (KAI-191)", async () => {
    const client = makeMockClient({
      rpcResult: { data: [{ outcome: "no_op", from_state: "awaiting_customer", to_state: "open", history_id: null }], error: null },
    });
    const result = await applyCustomerReplyTransition(client, "ticket-6", "awaiting_customer");
    expect(result.newStatus).toBeNull();
    expect(client._rpcFn).toHaveBeenCalledTimes(1);
  });

  it("does not write when the transition comes back invalid — removed defensive fallback (KAI-191)", async () => {
    const client = makeMockClient({
      rpcResult: { data: null, error: { code: "KA409", message: "apply_ticket_transition: illegal transition" } },
    });
    const result = await applyCustomerReplyTransition(client, "ticket-7", "resolved");
    expect(result.newStatus).toBeNull();
    expect(client._rpcFn).toHaveBeenCalledTimes(1);
  });

  it("records a customer reply on a closed ticket as an activity fact, not a transition (KAI-191 decision 3)", async () => {
    activityInsertMock.mockClear();
    activityFromMock.mockClear();
    const client = makeMockClient({ accountIdRow: { account_id: "acct-closed-1" } });

    const result = await applyCustomerReplyTransition(client, "ticket-closed-1", "closed");

    expect(result.newStatus).toBeNull();
    // No candidate exists for 'closed' — the transition RPC must never be called.
    expect(client._rpcFn).not.toHaveBeenCalled();
    // But the reply must not vanish silently: an activity row is recorded.
    expect(activityFromMock).toHaveBeenCalledWith("ticket_activity_log");
    expect(activityInsertMock).toHaveBeenCalledTimes(1);
    expect(activityInsertMock.mock.calls[0][0]).toMatchObject({
      account_id: "acct-closed-1",
      ticket_id: "ticket-closed-1",
      domain: "tickets",
      event_type: "customer_reply_on_closed_ticket",
      actor_type: "customer",
    });
  });

  it("does not throw when account_id cannot be resolved for a closed-ticket reply", async () => {
    activityInsertMock.mockClear();
    const client = makeMockClient({ accountIdRow: null });

    const result = await applyCustomerReplyTransition(client, "ticket-closed-2", "closed");

    expect(result.newStatus).toBeNull();
    expect(activityInsertMock).not.toHaveBeenCalled();
  });
});
