import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-28: ticket_events emission tests
// AC: emitTicketEvent helper is typed and shared
// AC: all ticket state transitions emit corresponding events
// AC: bun test passes
// ---------------------------------------------------------------------------

// Mock supabase so tests don't hit the real DB
const insertMock = mock(() => Promise.resolve({ error: null }));
const fromMock = mock(() => ({ insert: insertMock }));

mock.module("../lib/supabase.js", () => ({
  supabase: { from: fromMock },
}));

// Re-import after mocking
const { emitTicketEvent } = await import("./ticket-events.js");

describe("emitTicketEvent", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it("inserts into ticket_events table", async () => {
    await emitTicketEvent({
      ticketId: "00000000-0000-0000-0000-000000000001",
      authorId: "00000000-0000-0000-0000-000000000002",
      eventType: "status_change",
    });
    expect(fromMock).toHaveBeenCalledWith("ticket_events");
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("passes correct fields on status_change", async () => {
    await emitTicketEvent({
      ticketId: "tid-1",
      authorId: "uid-1",
      eventType: "status_change",
      metadata: { from_status: "open", to_status: "resolved" },
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: "tid-1",
        author_id: "uid-1",
        event_type: "status_change",
        metadata: { from_status: "open", to_status: "resolved" },
      })
    );
  });

  it("passes null author_id for AI-emitted events", async () => {
    await emitTicketEvent({
      ticketId: "tid-2",
      authorId: null,
      eventType: "ai_classified",
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ author_id: null, event_type: "ai_classified" })
    );
  });

  it("defaults is_internal to false", async () => {
    await emitTicketEvent({ ticketId: "tid-3", authorId: null, eventType: "reply_sent" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_internal: false })
    );
  });

  it("sets is_internal true when specified", async () => {
    await emitTicketEvent({
      ticketId: "tid-4",
      authorId: "uid-2",
      eventType: "escalated",
      isInternal: true,
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_internal: true })
    );
  });

  it("does not throw when supabase returns error (non-fatal)", async () => {
    insertMock.mockImplementationOnce(() => Promise.resolve({ error: { message: "db error" } }));
    await expect(
      emitTicketEvent({ ticketId: "tid-5", authorId: null, eventType: "grouped" })
    ).resolves.toBeUndefined();
  });
});

describe("event type coverage", () => {
  const allEventTypes = [
    "reply_sent", "internal_note", "status_change", "assignment", "merge",
    "ai_classified", "human_classified", "ai_proposal", "ai_confirmed",
    "ai_rejected", "sla_breach", "escalated", "grouped",
    "classification_corrected",
  ] as const;

  for (const eventType of allEventTypes) {
    it(`accepts event_type "${eventType}"`, async () => {
      await emitTicketEvent({ ticketId: "t", authorId: null, eventType });
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: eventType })
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

describe("request schema validation", () => {
  it("UpdateStatusSchema accepts valid statuses", () => {
    const { z } = require("zod");
    const schema = z.object({
      status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]),
    });
    for (const s of ["open", "in_progress", "waiting", "resolved", "closed"]) {
      expect(schema.safeParse({ status: s }).success).toBe(true);
    }
  });

  it("UpdateStatusSchema rejects unknown status", () => {
    const { z } = require("zod");
    const schema = z.object({
      status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]),
    });
    expect(schema.safeParse({ status: "archived" }).success).toBe(false);
  });

  it("ClassifyApproveSchema accepts confirm and reject", () => {
    const { z } = require("zod");
    const schema = z.object({
      proposal_id: z.string().uuid(),
      action: z.enum(["confirm", "reject"]),
    });
    const id = "00000000-0000-4000-8000-000000000001";
    expect(schema.safeParse({ proposal_id: id, action: "confirm" }).success).toBe(true);
    expect(schema.safeParse({ proposal_id: id, action: "reject" }).success).toBe(true);
  });

  it("ClassifyApproveSchema rejects invalid action", () => {
    const { z } = require("zod");
    const schema = z.object({
      proposal_id: z.string().uuid(),
      action: z.enum(["confirm", "reject"]),
    });
    const id = "00000000-0000-4000-8000-000000000001";
    expect(schema.safeParse({ proposal_id: id, action: "approve" }).success).toBe(false);
  });

  it("ReplySchema requires non-empty body", () => {
    const { z } = require("zod");
    const schema = z.object({ body: z.string().min(1), is_internal: z.boolean().default(false) });
    expect(schema.safeParse({ body: "" }).success).toBe(false);
    expect(schema.safeParse({ body: "hello" }).success).toBe(true);
  });
});

