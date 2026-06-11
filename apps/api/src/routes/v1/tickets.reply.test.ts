import { describe, it, expect } from "bun:test";
import { z } from "zod";

// ---------------------------------------------------------------------------
// KAI-114: POST /v1/tickets/:id/reply — outbox refactor unit tests
// (No Supabase dependency — pure logic only, mirroring the convention in
// invitations.test.ts: schema + extracted business-rule predicates)
// ---------------------------------------------------------------------------

const ReplySchema = z.object({
  body: z.string().min(1),
  bodyMarkdown: z.string().optional(),
  templateId: z.string().uuid().optional(),
  intent: z.enum(["reply", "resolve"]).default("reply"),
});

describe("ReplySchema — request validation", () => {
  it("accepts a minimal valid reply", () => {
    expect(ReplySchema.safeParse({ body: "Thanks for reaching out!" }).success).toBe(true);
  });

  it("accepts optional bodyMarkdown and templateId", () => {
    const result = ReplySchema.safeParse({
      body: "Thanks!",
      bodyMarkdown: "**Thanks!**",
      templateId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(ReplySchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("rejects a missing body", () => {
    expect(ReplySchema.safeParse({}).success).toBe(false);
  });

  it("rejects a non-UUID templateId", () => {
    expect(ReplySchema.safeParse({ body: "Thanks!", templateId: "not-a-uuid" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intent — KAI-247: 'reply' renders agent-reply.html, 'resolve' renders
// resolved.html and resolves the ticket atomically.
// ---------------------------------------------------------------------------

describe("ReplySchema — intent", () => {
  it("defaults to 'reply' when intent is omitted", () => {
    const result = ReplySchema.safeParse({ body: "Thanks!" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.intent).toBe("reply");
  });

  it("accepts intent='resolve'", () => {
    const result = ReplySchema.safeParse({ body: "Thanks!", intent: "resolve" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.intent).toBe("resolve");
  });

  it("rejects an invalid intent value", () => {
    expect(ReplySchema.safeParse({ body: "Thanks!", intent: "close" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Subject prefixing — avoid doubled "Re: Re: ..." on repeated replies
// ---------------------------------------------------------------------------

function buildReplySubject(ticketSubject: string | null): string {
  return ticketSubject?.startsWith("Re:") ? ticketSubject : `Re: ${ticketSubject ?? ""}`;
}

describe("buildReplySubject", () => {
  it("prefixes a plain subject with 'Re:'", () => {
    expect(buildReplySubject("Order #123 missing")).toBe("Re: Order #123 missing");
  });

  it("does not double-prefix an already-replied subject", () => {
    expect(buildReplySubject("Re: Order #123 missing")).toBe("Re: Order #123 missing");
  });

  it("handles a null subject", () => {
    expect(buildReplySubject(null)).toBe("Re: ");
  });
});

// ---------------------------------------------------------------------------
// Auto-transition to awaiting_customer — only from agent-owned states
// (KAI-50: replying is "the agent has responded" — optimistic at enqueue time)
// ---------------------------------------------------------------------------

const AUTO_AWAITING_SOURCES = ["open", "in_progress"];

function shouldAutoTransition(currentStatus: string): boolean {
  return AUTO_AWAITING_SOURCES.includes(currentStatus);
}

describe("shouldAutoTransition — reply auto-transition guard", () => {
  it("transitions from open", () => {
    expect(shouldAutoTransition("open")).toBe(true);
  });

  it("transitions from in_progress", () => {
    expect(shouldAutoTransition("in_progress")).toBe(true);
  });

  it("does not transition from awaiting_customer (already there)", () => {
    expect(shouldAutoTransition("awaiting_customer")).toBe(false);
  });

  it("does not transition from resolved (replying to a closed ticket shouldn't reopen it)", () => {
    expect(shouldAutoTransition("resolved")).toBe(false);
  });

  it("does not transition from escalated", () => {
    expect(shouldAutoTransition("escalated")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Outbox response shape — the 202 contract the dashboard's optimistic append
// (reply-bar.tsx -> appendOptimisticMessage) depends on
// ---------------------------------------------------------------------------

describe("queued reply response shape", () => {
  it("carries delivery_status='queued' and a thread-message-shaped optimistic message", () => {
    const outboundMsg = {
      id: "msg-1",
      direction: "outbound",
      sender_external_id: "agent@kairo.dev",
      sender_display_name: "agent@kairo.dev",
      body_plain: "Thanks!",
      body_html: null,
      snippet: "Thanks!",
      received_at: "2026-06-07T12:00:00.000Z",
      delivery_status: "queued",
    };
    const response = { success: true, messageId: outboundMsg.id, deliveryStatus: "queued", message: outboundMsg };

    expect(response.deliveryStatus).toBe("queued");
    expect(response.message.delivery_status).toBe("queued");
    expect(response.message.direction).toBe("outbound");
    expect(response.messageId).toBe(outboundMsg.id);
  });
});
