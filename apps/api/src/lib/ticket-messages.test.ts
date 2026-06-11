import { describe, it, expect, mock } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-165: ticket-messages.ts unit tests
// ---------------------------------------------------------------------------

const { linkMessageToTicket, countTicketMessages } = await import("./ticket-messages.js");

function makeMockClient(upsertError: unknown = null) {
  const upsertFn = mock(async () => ({ error: upsertError }));
  // .upsert(..., { ... }) returns { error }
  const fromFn = mock(() => ({ upsert: upsertFn }));
  return { from: fromFn, _upsertFn: upsertFn } as unknown as {
    from: typeof fromFn;
    _upsertFn: typeof upsertFn;
  } & Parameters<typeof linkMessageToTicket>[0];
}

describe("linkMessageToTicket", () => {
  it("calls upsert on ticket_messages with is_origin=true", async () => {
    const client = makeMockClient();
    await linkMessageToTicket(client, {
      ticket_id: "ticket-1",
      message_id: "msg-1",
      is_origin: true,
    });
    expect(client._upsertFn).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — does not throw on duplicate (ignoreDuplicates)", async () => {
    const client = makeMockClient(null); // no error = ON CONFLICT DO NOTHING
    await expect(
      linkMessageToTicket(client, {
        ticket_id: "ticket-1",
        message_id: "msg-1",
        is_origin: false,
      })
    ).resolves.toBeUndefined();
  });

  it("logs but does not throw on error", async () => {
    const client = makeMockClient({ code: "PGRST", message: "some db error" });
    // Should not throw
    await expect(
      linkMessageToTicket(client, {
        ticket_id: "ticket-1",
        message_id: "msg-1",
        is_origin: false,
      })
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// KAI-247: countTicketMessages — {{message_count}}
// ---------------------------------------------------------------------------

function makeCountClient(count: number | null) {
  const eqFn = mock(async () => ({ count, error: null }));
  const selectFn = mock(() => ({ eq: eqFn }));
  const fromFn = mock(() => ({ select: selectFn }));
  return { from: fromFn, _selectFn: selectFn, _eqFn: eqFn } as unknown as {
    from: typeof fromFn;
    _selectFn: typeof selectFn;
    _eqFn: typeof eqFn;
  } & Parameters<typeof countTicketMessages>[0];
}

describe("countTicketMessages", () => {
  it("returns the row count for the ticket", async () => {
    const client = makeCountClient(3);
    await expect(countTicketMessages(client, "ticket-1")).resolves.toBe(3);
    expect(client._selectFn).toHaveBeenCalledWith("*", { count: "exact", head: true });
    expect(client._eqFn).toHaveBeenCalledWith("ticket_id", "ticket-1");
  });

  it("returns 0 when count is null", async () => {
    const client = makeCountClient(null);
    await expect(countTicketMessages(client, "ticket-1")).resolves.toBe(0);
  });
});
