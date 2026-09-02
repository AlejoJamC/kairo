import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";

// Mock global fetch BEFORE importing the module under test (gmail-send uses it).
const mockFetch = mock(async (_url: string, _opts: RequestInit) => ({
  ok: true,
  status: 200,
  json: async () => ({ id: "auto-msg-1", threadId: "t-1" }),
  text: async () => "",
}));
const originalFetch = globalThis.fetch;
globalThis.fetch = mockFetch as unknown as typeof fetch;

// Restore the real fetch once this file's tests finish — globalThis.fetch is
// process-wide state, and leaving the mock in place breaks any other test
// file that runs later in the same `bun test` invocation and makes a real
// network call (e.g. the KAI-191 integration tests that hit the real
// linked Supabase project). Same fix already applied to gmail-send.test.ts.
afterAll(() => {
  globalThis.fetch = originalFetch;
});

// Mock supabase so the emitTicketActivity() call inside out-of-hours-reply.ts
// (KAI-191 follow-up) doesn't hit the real DB — tests assert against this
// insert instead.
const activityInsertMock = mock((): Promise<{ error: { message: string } | null }> => Promise.resolve({ error: null }));
const activityFromMock = mock(() => ({ insert: activityInsertMock }));
mock.module("./supabase.js", () => ({
  supabase: { from: activityFromMock },
}));

const { maybeSendOutOfHoursReply } = await import("./out-of-hours-reply.js");

// Bogota times for the support-hours predicate
const monBogota22 = new Date("2026-05-05T03:00:00Z"); // Mon 22:00 Bogota — after-hours
const monBogota10 = new Date("2026-05-04T15:00:00Z"); // Mon 10:00 Bogota — within hours

interface SupabaseStub {
  scheduleRows: unknown[];
  priorAutoReply: { id: string } | null;
  ticketUpdates: Array<Record<string, unknown>>;
}

function makeSupabaseStub(opts: Partial<SupabaseStub> = {}): {
  client: any;
  state: SupabaseStub;
} {
  const state: SupabaseStub = {
    scheduleRows: opts.scheduleRows ?? [],
    priorAutoReply: opts.priorAutoReply ?? null,
    ticketUpdates: [],
  };

  function chain(table: string, op: "select" | "update" | "insert" | "delete"): any {
    const ctx: { filters: Record<string, unknown>; payload?: unknown } = { filters: {} };
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        ctx.filters[col] = val;
        return builder;
      },
      limit: () => builder,
      order: () => builder,
      maybeSingle: async () => {
        if (table === "tickets" && op === "select") {
          return { data: state.priorAutoReply, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
      then: undefined as any,
    };

    if (op === "select" && table === "support_schedules") {
      // Eager-resolve when awaited directly
      builder.then = (resolve: any) => resolve({ data: state.scheduleRows, error: null });
    }
    if (op === "update" && table === "tickets") {
      builder.then = (resolve: any) => {
        state.ticketUpdates.push({ ...ctx, payload: ctx.payload });
        resolve({ data: null, error: null });
      };
    }
    return builder;
  }

  const client = {
    from(table: string) {
      return {
        select: () => chain(table, "select"),
        update: (payload: unknown) => {
          const b = chain(table, "update");
          b.payload = payload;
          b.then = (resolve: any) => {
            state.ticketUpdates.push({ payload });
            resolve({ data: null, error: null });
          };
          return b;
        },
      };
    },
  };

  return { client, state };
}

const BASE_ARGS = {
  accountId: "acc-1",
  ticketId: "tk-1",
  gmailAccessToken: "tok",
  gmailThreadId: "t-1",
  gmailMessageId: "msg-1",
  fromHeader: '"Jane" <jane@example.com>',
  subject: "Need help",
  receivedAt: new Date(monBogota22.getTime() - 60_000).toISOString(), // 1min ago
};

beforeEach(() => {
  mockFetch.mockClear();
  activityInsertMock.mockClear();
  activityFromMock.mockClear();
});

describe("maybeSendOutOfHoursReply — guards", () => {
  it("aborts (stale) when receivedAt > 15min before now", async () => {
    const { client } = makeSupabaseStub();
    const oldReceived = new Date(monBogota22.getTime() - 20 * 60_000).toISOString();
    const result = await maybeSendOutOfHoursReply({
      ...BASE_ARGS,
      supabase: client,
      receivedAt: oldReceived,
      now: monBogota22,
    });
    expect(result).toEqual({ sent: false, reason: "stale" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("aborts (no_thread_id) when threadId is missing", async () => {
    const { client } = makeSupabaseStub();
    const result = await maybeSendOutOfHoursReply({
      ...BASE_ARGS,
      supabase: client,
      gmailThreadId: null,
      now: monBogota22,
    });
    expect(result).toEqual({ sent: false, reason: "no_thread_id" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("aborts (no_recipient) when From header has no email", async () => {
    const { client } = makeSupabaseStub();
    const result = await maybeSendOutOfHoursReply({
      ...BASE_ARGS,
      supabase: client,
      fromHeader: "no-email-here",
      now: monBogota22,
    });
    expect(result).toEqual({ sent: false, reason: "no_recipient" });
  });

  it("aborts (within_hours) when DEFAULT_SCHEDULE matches now", async () => {
    const { client } = makeSupabaseStub();
    const result = await maybeSendOutOfHoursReply({
      ...BASE_ARGS,
      supabase: client,
      receivedAt: new Date(monBogota10.getTime() - 60_000).toISOString(),
      now: monBogota10,
    });
    expect(result).toEqual({ sent: false, reason: "within_hours" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("aborts (already_replied) when same thread is marked", async () => {
    const { client } = makeSupabaseStub({ priorAutoReply: { id: "tk-prior" } });
    const result = await maybeSendOutOfHoursReply({
      ...BASE_ARGS,
      supabase: client,
      now: monBogota22,
    });
    expect(result).toEqual({ sent: false, reason: "already_replied" });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("maybeSendOutOfHoursReply — happy path", () => {
  it("sends reply and marks ticket when out of hours, fresh, no prior reply", async () => {
    const { client, state } = makeSupabaseStub();
    const result = await maybeSendOutOfHoursReply({
      ...BASE_ARGS,
      supabase: client,
      now: monBogota22,
    });
    expect(result).toEqual({ sent: true });
    // 1 call to send + 1 follow-up `messages.get` for the real Message-ID
    // header (KAI-248 Group 2 — see gmail-send.ts sendGmailReply()).
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("gmail.googleapis.com");
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.threadId).toBe("t-1");
    // raw is base64url MIME — decode and assert recipient
    const decoded = Buffer.from(body.raw, "base64").toString("utf-8");
    expect(decoded).toContain("To: jane@example.com");
    // Body part is base64-encoded (Content-Transfer-Encoding: base64) — decode it
    const bodyPart = decoded.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\s+/g, "");
    const decodedBody = Buffer.from(bodyPart, "base64").toString("utf-8");
    expect(decodedBody).toContain("horario de soporte");

    expect(state.ticketUpdates.length).toBeGreaterThan(0);
    const lastUpdate = state.ticketUpdates[state.ticketUpdates.length - 1];
    expect((lastUpdate.payload as any).auto_replied_out_of_hours).toBe(true);

    // KAI-191 follow-up: the send is a residual ticket fact and must leave a
    // trace in ticket_activity_log, same shape as assignment/merge/grouped/etc.
    expect(activityFromMock).toHaveBeenCalledWith("ticket_activity_log");
    expect(activityInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc-1",
        ticket_id: "tk-1",
        domain: "messaging",
        event_type: "out_of_hours_auto_reply",
        actor_type: "system",
        actor_ref: "out-of-hours-reply",
      })
    );
  });
});
