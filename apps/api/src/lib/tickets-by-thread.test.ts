import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-165: tickets-by-thread.ts unit tests
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

function makeMockClient({
  existingTicket = null as { id: string; status: string } | null,
  insertedTicket = null as { id: string } | null,
  insertError = null as { code: string; message: string } | null,
  raceTicket = null as { id: string; status: string } | null,
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

  // insert chain: .from("tickets").insert().select().single()
  const insertSelectFn = mock(() => ({ single: singleInsertFn }));
  const insertFn = mock(() => ({ select: insertSelectFn }));

  const fromFn = mock((_table: string) => ({
    select: selectChain,
    insert: insertFn,
  }));

  return { from: fromFn } as unknown as Parameters<typeof findOrCreateTicketForThread>[0];
}

describe("findOrCreateTicketForThread", () => {
  it("returns existing ticket when found (was_created=false)", async () => {
    const client = makeMockClient({ existingTicket: { id: "ticket-existing", status: "open" } });
    const result = await findOrCreateTicketForThread(client, BASE_ARGS);
    expect(result.ticket_id).toBe("ticket-existing");
    expect(result.was_created).toBe(false);
    expect(result.prior_status).toBe("open");
  });

  it("creates new ticket when none exists (was_created=true)", async () => {
    const client = makeMockClient({ insertedTicket: { id: "ticket-new" } });
    const result = await findOrCreateTicketForThread(client, BASE_ARGS);
    expect(result.ticket_id).toBe("ticket-new");
    expect(result.was_created).toBe(true);
    expect(result.prior_status).toBeNull();
  });

  it("handles 23505 race condition — re-reads and returns was_created=false", async () => {
    const client = makeMockClient({
      insertError: { code: "23505", message: "unique violation" },
      raceTicket: { id: "ticket-race", status: "awaiting_customer" },
    });
    const result = await findOrCreateTicketForThread(client, BASE_ARGS);
    expect(result.ticket_id).toBe("ticket-race");
    expect(result.was_created).toBe(false);
    expect(result.prior_status).toBe("awaiting_customer");
  });

  it("throws on non-23505 insert error", async () => {
    const client = makeMockClient({
      insertError: { code: "42P01", message: "table does not exist" },
    });
    await expect(findOrCreateTicketForThread(client, BASE_ARGS)).rejects.toThrow(
      "[tickets-by-thread] insert failed"
    );
  });
});
