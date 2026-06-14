import { describe, it, expect, beforeEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-246: maybeSendTicketAcknowledgement unit tests
// ---------------------------------------------------------------------------

const ENV_KEY = "FEATURE_FLAG_ENABLE_TICKET_ACKNOWLEDGEMENT";

const renderAcknowledgementMock = mock((vars: Record<string, unknown>) => `<html>${JSON.stringify(vars)}</html>`);
mock.module("../emails/registry.js", () => ({
  renderAcknowledgement: renderAcknowledgementMock,
  buildTicketId: (n: number) => `KAI-T-${n}`,
}));

let resolvedUrls = {
  help_center_url: "",
  status_url: "",
  privacy_url: "https://kairo.alejojamc.com/privacy/",
  unsubscribe_url: "",
  ticket_url: "",
};
const resolveEmailUrlsMock = mock(() => Promise.resolve(resolvedUrls));
mock.module("../emails/urls.js", () => ({
  resolveEmailUrls: resolveEmailUrlsMock,
}));

mock.module("../emails/format.js", () => ({
  formatEmailDate: (iso: string) => `formatted(${iso})`,
}));

let gmailEmail = "support@acme.com";
const getGmailEmailByAccountMock = mock(() => Promise.resolve(gmailEmail));
mock.module("./gmail-token.js", () => ({
  getGmailEmailByAccount: getGmailEmailByAccountMock,
}));

const inngestSendMock = mock((_event: { name: string; data: Record<string, unknown> }) => Promise.resolve());
mock.module("./inngest.js", () => ({
  inngest: { send: inngestSendMock },
}));

const { maybeSendTicketAcknowledgement } = await import("./ticket-acknowledgement.js");

const now = new Date("2026-06-10T15:00:00Z");

const BASE_ARGS = {
  accountId: "acc-1",
  ticketId: "tk-1",
  ticketNumber: 453,
  conversationId: "conv-1",
  channelIntegrationId: "chan-1",
  gmailThreadId: "thread-1",
  subject: "Order issue",
  fromHeader: '"Jane" <jane@example.com>',
  customerDisplayName: "Jane",
  category: "billing",
  receivedAt: new Date(now.getTime() - 60_000).toISOString(), // 1min ago
  messageIdHeader: "<msg-1@mail.gmail.com>",
  now,
};

interface SupabaseStub {
  insertedId: string | null;
  insertError: { message: string } | null;
  inserted: Array<Record<string, unknown>>;
  linkedMessages: Array<{ ticket_id: string; message_id: string; is_origin: boolean }>;
}

function makeSupabaseStub(opts: Partial<SupabaseStub> = {}) {
  const state: SupabaseStub = {
    insertedId: opts.insertedId ?? "msg-1",
    insertError: opts.insertError ?? null,
    inserted: [],
    linkedMessages: [],
  };

  const client = {
    from(table: string) {
      return {
        insert: (payload: Record<string, unknown>) => {
          state.inserted.push(payload);
          return {
            select: () => ({
              single: async () => {
                if (state.insertError) return { data: null, error: state.insertError };
                return { data: { id: state.insertedId }, error: null };
              },
            }),
          };
        },
        upsert: (payload: Record<string, unknown>) => {
          if (table === "ticket_messages") {
            state.linkedMessages.push(payload as never);
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { client, state };
}

beforeEach(() => {
  delete process.env[ENV_KEY];
  renderAcknowledgementMock.mockClear();
  resolveEmailUrlsMock.mockClear();
  getGmailEmailByAccountMock.mockClear();
  inngestSendMock.mockClear();
  resolvedUrls = {
    help_center_url: "",
    status_url: "",
    privacy_url: "https://kairo.alejojamc.com/privacy/",
    unsubscribe_url: "",
    ticket_url: "",
  };
  gmailEmail = "support@acme.com";
});

describe("maybeSendTicketAcknowledgement — guards", () => {
  it("aborts (flag_disabled) when the feature flag is off (default)", async () => {
    const { client } = makeSupabaseStub();
    const result = await maybeSendTicketAcknowledgement({ ...BASE_ARGS, supabase: client as never });
    expect(result).toEqual({ sent: false, reason: "flag_disabled" });
    expect(renderAcknowledgementMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("aborts (stale) when receivedAt > 15min before now, even with the flag on", async () => {
    process.env[ENV_KEY] = "true";
    const { client } = makeSupabaseStub();
    const oldReceived = new Date(now.getTime() - 20 * 60_000).toISOString();
    const result = await maybeSendTicketAcknowledgement({
      ...BASE_ARGS,
      supabase: client as never,
      receivedAt: oldReceived,
    });
    expect(result).toEqual({ sent: false, reason: "stale" });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("aborts (no_thread_id) when gmailThreadId is null", async () => {
    process.env[ENV_KEY] = "true";
    const { client } = makeSupabaseStub();
    const result = await maybeSendTicketAcknowledgement({
      ...BASE_ARGS,
      supabase: client as never,
      gmailThreadId: null,
    });
    expect(result).toEqual({ sent: false, reason: "no_thread_id" });
  });

  it("aborts (no_recipient) when fromHeader has no email", async () => {
    process.env[ENV_KEY] = "true";
    const { client } = makeSupabaseStub();
    const result = await maybeSendTicketAcknowledgement({
      ...BASE_ARGS,
      supabase: client as never,
      fromHeader: "no-email-here",
    });
    expect(result).toEqual({ sent: false, reason: "no_recipient" });
  });

  it("returns send_failed when the messages insert errors", async () => {
    process.env[ENV_KEY] = "true";
    const { client } = makeSupabaseStub({ insertError: { message: "db down" } });
    const result = await maybeSendTicketAcknowledgement({ ...BASE_ARGS, supabase: client as never });
    expect(result).toEqual({ sent: false, reason: "send_failed" });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

describe("maybeSendTicketAcknowledgement — happy path", () => {
  it("renders acknowledgement.html, queues the outbound message, and enqueues the send", async () => {
    process.env[ENV_KEY] = "true";
    const { client, state } = makeSupabaseStub();

    const result = await maybeSendTicketAcknowledgement({ ...BASE_ARGS, supabase: client as never });

    expect(result).toEqual({ sent: true });

    // renderAcknowledgement received the documented AcknowledgementVars contract
    expect(renderAcknowledgementMock).toHaveBeenCalledTimes(1);
    const vars = renderAcknowledgementMock.mock.calls[0][0] as Record<string, unknown>;
    expect(vars.customer_name).toBe("Jane");
    expect(vars.ticket_id).toBe("KAI-T-453");
    expect(vars.ticket_subject).toBe("Order issue");
    expect(vars.ticket_category).toBe("billing");
    expect(vars.ticket_created_at).toBe(`formatted(${BASE_ARGS.receivedAt})`);
    expect(vars.help_center_url).toBe("");

    // outbox insert
    expect(state.inserted).toHaveLength(1);
    const insertedRow = state.inserted[0];
    expect(insertedRow.direction).toBe("outbound");
    expect(insertedRow.delivery_status).toBe("queued");
    expect(insertedRow.thread_external_id).toBe("thread-1");
    expect(insertedRow.conversation_id).toBe("conv-1");
    expect(insertedRow.channel_integration_id).toBe("chan-1");
    expect(insertedRow.body_html).toContain("<html>");

    // linked to ticket
    expect(state.linkedMessages).toEqual([{ ticket_id: "tk-1", message_id: "msg-1", is_origin: false }]);

    // enqueued for send
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const event = inngestSendMock.mock.calls[0][0] as { name: string; data: Record<string, unknown> };
    expect(event.name).toBe("messages/outbound.queued");
    expect(event.data.messageId).toBe("msg-1");
    expect(event.data.ticketId).toBe("tk-1");
    expect(event.data.accountId).toBe("acc-1");
    expect(event.data.provider).toBe("gmail");
    expect(event.data.to).toBe("jane@example.com");
    expect(event.data.subject).toBe("Re: Order issue [KAIRO-453]");
    expect(event.data.threadExternalId).toBe("thread-1");
    expect(event.data.inReplyToExternalId).toBe("<msg-1@mail.gmail.com>");
  });

  it("falls back to the local part of the recipient email when customerDisplayName is null", async () => {
    process.env[ENV_KEY] = "true";
    const { client } = makeSupabaseStub();

    await maybeSendTicketAcknowledgement({
      ...BASE_ARGS,
      supabase: client as never,
      customerDisplayName: null,
    });

    const vars = renderAcknowledgementMock.mock.calls[0][0] as Record<string, unknown>;
    expect(vars.customer_name).toBe("jane");
  });

  it("omits inReplyToExternalId when messageIdHeader is null", async () => {
    process.env[ENV_KEY] = "true";
    const { client } = makeSupabaseStub();

    await maybeSendTicketAcknowledgement({
      ...BASE_ARGS,
      supabase: client as never,
      messageIdHeader: null,
    });

    const event = inngestSendMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(event.data.inReplyToExternalId).toBeUndefined();
  });
});
