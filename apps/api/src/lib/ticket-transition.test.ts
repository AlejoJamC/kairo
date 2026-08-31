import { describe, it, expect, mock } from "bun:test";
import { transitionTicketStatus } from "./ticket-transition.js";

// ---------------------------------------------------------------------------
// KAI-191 — transitionTicketStatus() unit tests
//
// transitionTicketStatus() is a thin wrapper around the apply_ticket_transition
// RPC. These tests mock the RPC response/error shape supabase-js hands back
// and assert the four outcomes are surfaced correctly:
//   applied / no_op / invalid_transition / not_found
// ---------------------------------------------------------------------------

function makeMockClient(rpcResult: { data: unknown; error: unknown }) {
  const rpcFn = mock(async (_fn: string, _args: Record<string, unknown>) => rpcResult);
  return { rpc: rpcFn, _rpcFn: rpcFn } as unknown as Parameters<typeof transitionTicketStatus>[0] & {
    _rpcFn: typeof rpcFn;
  };
}

const BASE_ARGS = {
  ticketId: "ticket-1",
  toState: "in_progress" as const,
  actorType: "human" as const,
  actorUserId: "user-1",
  trigger: "manual_status_change",
};

describe("transitionTicketStatus", () => {
  it("returns outcome=applied with fromState/toState/historyId on a legal transition", async () => {
    const client = makeMockClient({
      data: [{ outcome: "applied", from_state: "open", to_state: "in_progress", history_id: "hist-1" }],
      error: null,
    });

    const result = await transitionTicketStatus(client, BASE_ARGS);

    expect(result).toEqual({
      outcome: "applied",
      fromState: "open",
      toState: "in_progress",
      historyId: "hist-1",
    });
    expect(client._rpcFn).toHaveBeenCalledTimes(1);
    const [fnName, args] = client._rpcFn.mock.calls[0];
    expect(fnName).toBe("apply_ticket_transition");
    expect(args).toMatchObject({
      p_ticket_id: "ticket-1",
      p_to_state: "in_progress",
      p_actor_type: "human",
      p_actor_user_id: "user-1",
      p_trigger: "manual_status_change",
    });
  });

  it("returns outcome=no_op on a same-state request, without a historyId", async () => {
    const client = makeMockClient({
      data: [{ outcome: "no_op", from_state: "open", to_state: "open", history_id: null }],
      error: null,
    });

    const result = await transitionTicketStatus(client, { ...BASE_ARGS, toState: "open" });

    expect(result).toEqual({ outcome: "no_op", fromState: "open", toState: "open" });
  });

  it("returns outcome=invalid_transition when the RPC raises the KA409 SQLSTATE", async () => {
    const client = makeMockClient({
      data: null,
      error: { code: "KA409", message: "apply_ticket_transition: illegal transition from closed to open for ticket ticket-1" },
    });

    const result = await transitionTicketStatus(client, { ...BASE_ARGS, toState: "open" });

    expect(result.outcome).toBe("invalid_transition");
    if (result.outcome === "invalid_transition") {
      expect(result.message).toContain("illegal transition");
    }
  });

  it("returns outcome=not_found when the RPC raises the KA404 SQLSTATE", async () => {
    const client = makeMockClient({
      data: null,
      error: { code: "KA404", message: "apply_ticket_transition: ticket ticket-1 not found" },
    });

    const result = await transitionTicketStatus(client, BASE_ARGS);

    expect(result).toEqual({ outcome: "not_found" });
  });

  it("throws on an unexpected RPC error instead of swallowing it", async () => {
    const client = makeMockClient({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(transitionTicketStatus(client, BASE_ARGS)).rejects.toThrow("permission denied");
  });
});
