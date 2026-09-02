import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-28: ticket activity/classification emission tests
// KAI-191: emitTicketEvent/TicketEventType were removed — every event type
// the old catch-all events table used to carry has moved to a purpose-shaped
// home (ticket_state_history, ticket_activity_log, ticket_notes,
// ticket_classification_history) or was dropped outright (reply_sent,
// customer_replied — duplicates of a fact `messages` already holds). See
// emitTicketActivity and emitTicketClassification below for what replaced it.
// ---------------------------------------------------------------------------

// Mock supabase so tests don't hit the real DB
const insertMock = mock((): Promise<{ error: { message: string } | null }> => Promise.resolve({ error: null }));
const fromMock = mock(() => ({ insert: insertMock }));

mock.module("../lib/supabase.js", () => ({
  supabase: { from: fromMock },
}));

// Re-import after mocking
const { emitTicketActivity, emitTicketClassification } = await import("./ticket-events.js");

describe("emitTicketActivity", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it("inserts into ticket_activity_log table", async () => {
    await emitTicketActivity({
      accountId: "acc-1",
      ticketId: "tid-1",
      domain: "tickets",
      eventType: "assignment",
      actorType: "human",
      actorUserId: "uid-1",
      metadata: { assigned_to: "uid-1" },
    });
    expect(fromMock).toHaveBeenCalledWith("ticket_activity_log");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc-1",
        ticket_id: "tid-1",
        domain: "tickets",
        event_type: "assignment",
        actor_type: "human",
        actor_user_id: "uid-1",
        metadata: { assigned_to: "uid-1" },
      })
    );
  });

  it("passes reason through", async () => {
    await emitTicketActivity({
      accountId: "acc-1",
      ticketId: "tid-2",
      domain: "escalation",
      eventType: "escalated",
      actorType: "human",
      reason: "customer is very upset",
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "customer is very upset" })
    );
  });

  it("does not throw when supabase returns error (non-fatal)", async () => {
    insertMock.mockImplementationOnce(() => Promise.resolve({ error: { message: "db error" } }));
    await expect(
      emitTicketActivity({
        accountId: "acc-1",
        ticketId: "tid-3",
        domain: "deduplication",
        eventType: "merge",
        actorType: "system",
      })
    ).resolves.toBeUndefined();
  });

  const activityEventTypes = [
    "assignment", "merge", "merged_into", "grouped", "sla_breach", "escalated",
    "out_of_hours_auto_reply",
  ] as const;

  for (const eventType of activityEventTypes) {
    it(`accepts event_type "${eventType}"`, async () => {
      await emitTicketActivity({
        accountId: "acc-1",
        ticketId: "t",
        domain: "tickets",
        eventType,
        actorType: "system",
      });
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: eventType })
      );
      insertMock.mockClear();
      fromMock.mockClear();
    });
  }
});

describe("emitTicketClassification", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it("inserts into ticket_classification_history table", async () => {
    await emitTicketClassification({
      accountId: "acc-1",
      ticketId: "tid-1",
      actorType: "ai",
      actorRef: "tier2-background",
      dimension: "priority",
      applied: true,
      fromValue: null,
      toValue: "P1",
      confidence: 0.92,
      modelVersion: "test-model",
    });
    expect(fromMock).toHaveBeenCalledWith("ticket_classification_history");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc-1",
        ticket_id: "tid-1",
        actor_type: "ai",
        actor_ref: "tier2-background",
        dimension: "priority",
        from_value: null,
        to_value: "P1",
        confidence: 0.92,
        model_version: "test-model",
      })
    );
  });

  it("passes actor_user_id for human actors", async () => {
    await emitTicketClassification({
      accountId: "acc-1",
      ticketId: "tid-2",
      actorType: "human",
      actorUserId: "uid-1",
      dimension: "category",
      applied: true,
      fromValue: "billing",
      toValue: "technical",
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "human",
        actor_user_id: "uid-1",
        dimension: "category",
        from_value: "billing",
        to_value: "technical",
      })
    );
  });

  it("does not throw when supabase returns error (non-fatal)", async () => {
    insertMock.mockImplementationOnce(() => Promise.resolve({ error: { message: "db error" } }));
    await expect(
      emitTicketClassification({
        accountId: "acc-1",
        ticketId: "tid-3",
        actorType: "ai",
        dimension: "sentiment",
        applied: true,
        toValue: "frustrated",
      })
    ).resolves.toBeUndefined();
  });

  const dimensions = ["category", "priority", "sentiment", "emotion", "ticket_type"] as const;

  for (const dimension of dimensions) {
    it(`accepts dimension "${dimension}"`, async () => {
      await emitTicketClassification({
        accountId: "acc-1",
        ticketId: "t",
        actorType: "ai",
        dimension,
        applied: true,
        toValue: "x",
      });
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ dimension })
      );
      insertMock.mockClear();
      fromMock.mockClear();
    });
  }
});

describe("activity feed pagination logic", () => {
  it("limit clamps to 100 maximum", () => {
    const raw = 9999;
    const limit = Math.min(Number(raw ?? 50), 100);
    expect(limit).toBe(100);
  });

  it("limit defaults to 50", () => {
    const raw = undefined;
    const limit = Math.min(Number(raw ?? 50), 100);
    expect(limit).toBe(50);
  });

  it("cursor encodes created_at and id", () => {
    const payload = { created_at: "2026-05-06T10:00:00Z", id: "abc-123" };
    const cursor = btoa(JSON.stringify(payload));
    const decoded = JSON.parse(atob(cursor));
    expect(decoded.created_at).toBe(payload.created_at);
    expect(decoded.id).toBe(payload.id);
  });
});

// KAI-191: the "request schema validation" block that used to live here
// tested fabricated, disconnected copies of tickets.ts's zod schemas —
// UpdateStatusSchema's copy had drifted to ["open","in_progress","waiting",
// "resolved","closed"], a status list that was never real (no "waiting",
// missing awaiting_customer/reopened/escalated/ai_resolved). The real
// schemas already have real coverage against the real endpoints:
// tickets.status.test.ts, tickets.classify-approve.test.ts and
// tickets.reply.test.ts. Removed rather than fixed in place — a second,
// hand-maintained copy of a schema that already has real tests is exactly
// the kind of thing that drifts silently.

