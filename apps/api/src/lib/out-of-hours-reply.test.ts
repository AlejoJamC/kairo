import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock global fetch BEFORE importing the module under test (gmail-send uses it).
const mockFetch = mock(async (_url: string, _opts: RequestInit) => ({
  ok: true,
  status: 200,
  json: async () => ({ id: "auto-msg-1", threadId: "t-1" }),
  text: async () => "",
}));
globalThis.fetch = mockFetch as unknown as typeof fetch;

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
  userId: "u-1",
  ticketId: "tk-1",
  gmailAccessToken: "tok",
  gmailThreadId: "t-1",
  gmailMessageId: "msg-1",
  fromHeader: '"Jane" <jane@example.com>',
  subject: "Need help",
  receivedAt: new Date(monBogota22.getTime() - 60_000).toISOString(), // 1min ago
};

beforeEach(() => mockFetch.mockClear());

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
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("gmail.googleapis.com");
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.threadId).toBe("t-1");
    // raw is base64url MIME — decode and assert recipient
    const decoded = Buffer.from(body.raw, "base64").toString("utf-8");
    expect(decoded).toContain("To: jane@example.com");
    expect(decoded).toContain("horario de soporte");

    expect(state.ticketUpdates.length).toBeGreaterThan(0);
    const lastUpdate = state.ticketUpdates[state.ticketUpdates.length - 1];
    expect((lastUpdate.payload as any).auto_replied_out_of_hours).toBe(true);
  });
});
