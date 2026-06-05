import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-165: ticket-thread-transitions.ts unit tests
// ---------------------------------------------------------------------------

// Mock emitTicketEvent so we can verify calls without hitting DB
const emitMock = mock(async () => {});

mock.module("./ticket-events.js", () => ({
  emitTicketEvent: emitMock,
}));

const { applyCustomerReplyTransition } = await import("./ticket-thread-transitions.js");

function makeMockClient(updateError: unknown = null) {
  const updateFn = mock(async () => ({ error: updateError }));
  const eqFn = mock(() => ({ error: null }));
  const updateObj = { eq: eqFn };
  // chain: .from("tickets").update({}).eq("id", id)
  const fromFn = mock(() => ({
    update: mock(() => ({ eq: eqFn })),
  }));
  return { from: fromFn, _eqFn: eqFn } as unknown as Parameters<
    typeof applyCustomerReplyTransition
  >[0] & { _eqFn: typeof eqFn };
}

describe("applyCustomerReplyTransition", () => {
  beforeEach(() => {
    emitMock.mockClear();
  });

  it("transitions awaiting_customer → open", async () => {
    const client = makeMockClient();
    const result = await applyCustomerReplyTransition(client, "ticket-1", "awaiting_customer");
    expect(result.newStatus).toBe("open");
    // emitTicketEvent called twice: customer_replied + status_change
    expect(emitMock).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = emitMock.mock.calls;
    expect(firstCall[0].eventType).toBe("customer_replied");
    expect(secondCall[0].eventType).toBe("status_change");
    expect(secondCall[0].metadata).toMatchObject({ from: "awaiting_customer", to: "open" });
  });

  it("transitions resolved → reopened", async () => {
    const client = makeMockClient();
    const result = await applyCustomerReplyTransition(client, "ticket-2", "resolved");
    expect(result.newStatus).toBe("reopened");
    expect(emitMock).toHaveBeenCalledTimes(2);
    const [, secondCall] = emitMock.mock.calls;
    expect(secondCall[0].metadata).toMatchObject({ from: "resolved", to: "reopened" });
  });

  it("does not transition for open status", async () => {
    const client = makeMockClient();
    const result = await applyCustomerReplyTransition(client, "ticket-3", "open");
    expect(result.newStatus).toBeNull();
    // Only customer_replied event — no status_change
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0].eventType).toBe("customer_replied");
  });

  it("does not transition for in_progress status", async () => {
    const client = makeMockClient();
    const result = await applyCustomerReplyTransition(client, "ticket-4", "in_progress");
    expect(result.newStatus).toBeNull();
    expect(emitMock).toHaveBeenCalledTimes(1);
  });

  it("does not transition for null prior status", async () => {
    const client = makeMockClient();
    const result = await applyCustomerReplyTransition(client, "ticket-5", null);
    expect(result.newStatus).toBeNull();
    expect(emitMock).toHaveBeenCalledTimes(1);
  });
});
