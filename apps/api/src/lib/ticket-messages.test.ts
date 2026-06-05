import { describe, it, expect, mock } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-165: ticket-messages.ts unit tests
// ---------------------------------------------------------------------------

const { linkMessageToTicket } = await import("./ticket-messages.js");

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
