import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-165: tickets-by-thread.ts unit tests
// KAI-191: creation inserts with status='open' directly (so the ticket is
// valid and visible the instant it exists), then separately records a
// ticket_state_history trail row (from_state=NULL, to_state='open',
// trigger='ticket_created') via transitionTicketStatus(), which calls
// client.rpc("apply_ticket_transition", ...). We fake that RPC response on
// the mock client rather than mocking the "./ticket-transition.js" module
// itself — mock.module() is process-wide in bun:test (see
// ticket-thread-transitions.test.ts and gmail-poll-cron.test.ts for prior
// notes on this), and this file's sibling ticket-transition.test.ts needs
// the *real* transitionTicketStatus implementation, so nothing here may
// replace that module.
//
// A failed trail-row call must NOT throw: the INSERT already committed the
// ticket as open and visible in a separate round trip with no shared
// transaction, so throwing after that point would turn a merely degraded
// write (ticket fine, missing its t0 history row) into a failed ingestion
// for a ticket that in fact exists.
// ---------------------------------------------------------------------------

const { findOrCreateTicketForThread } = await import("./tickets-by-thread.js");

const BASE_ARGS = {
  accountId: "acct-0001",
  conversationId: "conv-0001",
  originatingUserId: "user-0001",
  classification: {
    type: "support",
    category: "billing",
    priority: "high",
    tone: "frustrated",
    confidence: 0.95,
    reasoning: "Test",
  },
  originMessage: {
    subject: "Help!",
    from_email: "alice@example.com",
    from_name: "Alice",
    to_email: "support@company.com",
    body_plain: "I need help",
    body_html: null,
    snippet: "I need help",
    gmail_message_id: "gmsg-001",
    gmail_thread_id: "gthread-001",
    received_at: new Date().toISOString(),
  },
  classifiedAt: new Date().toISOString(),
  classificationTier: 1,
  priorityScore: 0.85,
};

const APPLIED_CREATION_RPC = {
  data: [{ outcome: "applied", from_state: null, to_state: "open", history_id: "hist-created" }],
  error: null,
};

function makeMockClient({
  existingTicket = null as { id: string; ticket_number: number; status: string } | null,
  insertedTicket = null as { id: string; ticket_number: number } | null,
  insertError = null as { code: string; message: string } | null,
  raceTicket = null as { id: string; ticket_number: number; status: string } | null,
  rpcResult = APPLIED_CREATION_RPC as { data: unknown; error: unknown },
} = {}) {
  // Track how many times maybeSingle is called so we can return different values
  // for the initial SELECT (existingTicket) and the race re-read (raceTicket).
  let maybeSingleCallCount = 0;
  const maybeSingleFn = mock(async () => {
    maybeSingleCallCount++;
    if (maybeSingleCallCount === 1) {
      return { data: existingTicket, error: null };
    }
    // Second call = race re-read after 23505
    return { data: raceTicket, error: null };
  });

  const singleInsertFn = mock(async () => ({
    data: insertedTicket,
    error: insertError,
  }));

  // select chain: .from("tickets").select().eq().eq().is().limit().maybeSingle()
  const isFn = mock(() => ({ limit: mock(() => ({ maybeSingle: maybeSingleFn })) }));
  const eqFn = mock(() => ({ eq: eqFn, is: isFn }));
  const selectChain = mock(() => ({ eq: eqFn }));

  // insert chain: .from("tickets").insert(payload).select().single()
  const insertSelectFn = mock(() => ({ single: singleInsertFn }));
  const insertFn = mock((_payload: Record<string, unknown>) => ({ select: insertSelectFn }));

  const fromFn = mock((_table: string) => ({
    select: selectChain,
    insert: insertFn,
  }));

  // transitionTicketStatus() -> client.rpc("apply_ticket_transition", {...})
  const rpcFn = mock(async (_fnName: string, _args: Record<string, unknown>) => rpcResult);

  return { from: fromFn, rpc: rpcFn, _insertFn: insertFn, _rpcFn: rpcFn } as unknown as Parameters<
    typeof findOrCreateTicketForThread
  >[0] & { _insertFn: typeof insertFn; _rpcFn: typeof rpcFn };
}

describe("findOrCreateTicketForThread", () => {
  it("returns existing ticket when found (was_created=false)", async () => {
    const client = makeMockClient({ existingTicket: { id: "ticket-existing", ticket_number: 42, status: "open" } });
    const result = await findOrCreateTicketForThread(client, BASE_ARGS);
    expect(result.ticket_id).toBe("ticket-existing");
    expect(result.ticket_number).toBe(42);
    expect(result.was_created).toBe(false);
    expect(result.prior_status).toBe("open");
    // No creation row for an existing ticket.
    expect(client._rpcFn).not.toHaveBeenCalled();
  });

  it("creates new ticket when none exists (was_created=true), inserting with status='open' — never NULL", async () => {
    const client = makeMockClient({ insertedTicket: { id: "ticket-new", ticket_number: 101 } });
    const result = await findOrCreateTicketForThread(client, BASE_ARGS);
    expect(result.ticket_id).toBe("ticket-new");
    expect(result.ticket_number).toBe(101);
    expect(result.was_created).toBe(true);
    expect(result.prior_status).toBeNull();

    // The row is inserted with status='open' directly — the ticket must be
    // valid and visible (matched by status filters) the instant it exists,
    // independent of whether the follow-up trail-row call succeeds.
    const insertPayload = client._insertFn.mock.calls[0][0];
    expect(insertPayload.status).toBe("open");
  });

  it("records the creation transition (from_state=NULL, trigger=ticket_created) for a genuinely new ticket", async () => {
    const client = makeMockClient({ insertedTicket: { id: "ticket-new", ticket_number: 101 } });
    await findOrCreateTicketForThread(client, BASE_ARGS);

    expect(client._rpcFn).toHaveBeenCalledTimes(1);
    const [fnName, args] = client._rpcFn.mock.calls[0];
    expect(fnName).toBe("apply_ticket_transition");
    expect(args).toMatchObject({
      p_ticket_id: "ticket-new",
      p_to_state: "open",
      p_actor_type: "system",
      p_actor_ref: "tickets-by-thread",
      p_trigger: "ticket_created",
    });
  });

  it("handles 23505 race condition — re-reads and returns was_created=false, records no creation row", async () => {
    const client = makeMockClient({
      insertError: { code: "23505", message: "unique violation" },
      raceTicket: { id: "ticket-race", ticket_number: 7, status: "awaiting_customer" },
    });
    const result = await findOrCreateTicketForThread(client, BASE_ARGS);
    expect(result.ticket_id).toBe("ticket-race");
    expect(result.ticket_number).toBe(7);
    expect(result.was_created).toBe(false);
    expect(result.prior_status).toBe("awaiting_customer");
    // Only the genuinely-new-ticket branch records a creation row — the race
    // loser must not also record one for a ticket it didn't create.
    expect(client._rpcFn).not.toHaveBeenCalled();
  });

  it("throws on non-23505 insert error", async () => {
    const client = makeMockClient({
      insertError: { code: "42P01", message: "table does not exist" },
    });
    await expect(findOrCreateTicketForThread(client, BASE_ARGS)).rejects.toThrow(
      "[tickets-by-thread] insert failed"
    );
  });

  describe("a failing trail-row write degrades, it does not fail ingestion", () => {
    const originalConsoleError = console.error;

    beforeEach(() => {
      console.error = mock(() => {});
    });

    afterEach(() => {
      console.error = originalConsoleError;
    });

    it("still returns a usable, visible ticket when the creation transition doesn't come back applied", async () => {
      const client = makeMockClient({
        insertedTicket: { id: "ticket-new", ticket_number: 101 },
        rpcResult: { data: null, error: { code: "KA404", message: "apply_ticket_transition: ticket ticket-new not found" } },
      });

      // The ticket was already inserted with status='open' before this call,
      // and a failed trail-row write must not undo that or throw.
      const result = await findOrCreateTicketForThread(client, BASE_ARGS);

      expect(result).toEqual({
        ticket_id: "ticket-new",
        ticket_number: 101,
        was_created: true,
        prior_status: null,
      });
      const insertPayload = client._insertFn.mock.calls[0][0];
      expect(insertPayload.status).toBe("open");
      expect(console.error).toHaveBeenCalledTimes(1);
      expect((console.error as ReturnType<typeof mock>).mock.calls[0][0]).toContain(
        "failed to record ticket_created trail row"
      );
    });
  });
});
