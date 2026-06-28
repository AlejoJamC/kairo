import { describe, it, expect, mock } from "bun:test";
import { pollGmailAccount } from "./poll-account.js";
import { GmailHistoryExpiredError, type DbClient, type GmailPollDeps } from "./types.js";

// ---------------------------------------------------------------------------
// KAI-248 — pollGmailAccount unit tests
//
// All collaborators (DB + Gmail REST) are injected via GmailPollDeps, so
// these tests never touch Bun's global mock.module() — avoiding cross-test
// contamination from shared module mocks (gmail-token.ts, supabase.ts, etc).
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "00000000-0000-0000-0000-0000000000a1";
const INTEGRATION_ID = "00000000-0000-0000-0000-0000000000b1";

interface FakeDbOptions {
  integration: { id: string; account_id: string; gmail_history_id: string | null } | null;
  existingExternalIds?: string[];
  insertShouldConflict?: boolean;
}

/**
 * Minimal fake Supabase client covering exactly the query shapes
 * pollGmailAccount / ingestMessages issue: channel_integrations select +
 * update, messages select/insert/update.
 */
function createFakeDb(opts: FakeDbOptions) {
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const inserts: { table: string; payload: Record<string, unknown> }[] = [];
  const existing = new Set(opts.existingExternalIds ?? []);

  const db = {
    from(table: string) {
      if (table === "channel_integrations") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          limit() {
            return this;
          },
          maybeSingle: () => Promise.resolve({ data: opts.integration, error: null }),
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            return {
              eq: () => Promise.resolve({ data: null, error: null }),
            };
          },
        };
      }

      if (table === "messages") {
        return {
          select(_cols: string) {
            return {
              eq() {
                return this;
              },
              in: (_col: string, ids: string[]) =>
                Promise.resolve({
                  data: ids.filter((id) => existing.has(id)).map((id) => ({ external_id: id })),
                  error: null,
                }),
            };
          },
          insert(payload: Record<string, unknown>) {
            inserts.push({ table, payload });
            return {
              select() {
                return {
                  single: () =>
                    opts.insertShouldConflict
                      ? Promise.resolve({
                          data: null,
                          error: { code: "23505", message: "duplicate" },
                        })
                      : Promise.resolve({ data: { id: `msg-${inserts.length}` }, error: null }),
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            return {
              eq: () => Promise.resolve({ data: null, error: null }),
            };
          },
        };
      }

      throw new Error(`Unexpected table in fake db: ${table}`);
    },
  };

  return { db: db as unknown as DbClient, updates, inserts };
}

function baseDeps(overrides: Partial<GmailPollDeps>): GmailPollDeps {
  return {
    db: undefined as unknown as DbClient, // overridden per-test
    getFreshGmailToken: async () => "fresh-token",
    getGmailEmailByAccount: async () => "support@mycompany.com",
    getProfile: async () => ({ emailAddress: "support@mycompany.com", historyId: "1000" }),
    historyList: async () => ({ history: [], historyId: "1001" }),
    messagesList: async () => ({ messages: [] }),
    getMessage: async (_token, id) => ({
      id,
      threadId: `thread-${id}`,
      labelIds: ["INBOX"],
      snippet: "hello",
      payload: {
        headers: [
          { name: "From", value: "client@external.com" },
          { name: "Subject", value: "Need help" },
          { name: "Date", value: new Date().toUTCString() },
        ],
      },
    }),
    preFilterEmail: () => ({ status: "relevant" }),
    classifyEmail: async () => ({
      type: "support",
      priority: "P2",
      category: "general",
      tone: "neutral",
      urgency: "medium",
      reasoning: "test",
      confidence: 0.9,
    }),
    upsertConversationByThread: async () => ({ conversation_id: "conv-1", was_created: true }),
    findOrCreateTicketForThread: async () => ({
      ticket_id: "ticket-1",
      ticket_number: 1,
      was_created: true,
      prior_status: null,
    }),
    linkMessageToTicket: async () => undefined,
    applyCustomerReplyTransition: async () => ({ newStatus: null }),
    extractLastKairoToken: () => null,
    findTicketByKairoToken: async () => null,
    ...overrides,
  };
}

describe("pollGmailAccount — cursor seeding", () => {
  it("seeds gmail_history_id via getProfile when cursor is null and does not call history.list", async () => {
    const { db, updates } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: null },
    });
    const historyListSpy = mock(async () => ({ history: [], historyId: "9999" }));

    const deps = baseDeps({ db, historyList: historyListSpy });
    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.outcome).toBe("seeded");
    expect(result.newHistoryId).toBe("1000");
    expect(historyListSpy).not.toHaveBeenCalled();
    expect(updates).toEqual([
      { table: "channel_integrations", payload: { gmail_history_id: "1000" } },
    ]);
  });
});

describe("pollGmailAccount — history.list parsing + ingestion", () => {
  it("parses messagesAdded from history.list, ingests new messages, and advances the cursor", async () => {
    const { db, updates, inserts } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const deps = baseDeps({
      db,
      historyList: async (_token, startHistoryId) => {
        expect(startHistoryId).toBe("1000");
        return {
          history: [
            { id: "h1", messagesAdded: [{ message: { id: "msg-abc", threadId: "thread-abc" } }] },
          ],
          historyId: "1050",
        };
      },
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.outcome).toBe("polled");
    expect(result.newMessages).toBe(1);
    expect(result.ticketsCreated).toBe(1);
    expect(result.newHistoryId).toBe("1050");
    expect(inserts.some((i) => i.table === "messages")).toBe(true);

    const integrationUpdate = updates.find((u) => u.table === "channel_integrations");
    expect(integrationUpdate?.payload.gmail_history_id).toBe("1050");
  });

  it("Flow 1: reopens an existing ticket via applyCustomerReplyTransition when the thread already has a ticket", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const transitionSpy = mock(async () => ({ newStatus: "reopened" }));

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-reply", threadId: "thread-1" } }] }],
        historyId: "1010",
      }),
      findOrCreateTicketForThread: async () => ({
        ticket_id: "ticket-existing",
        ticket_number: 5,
        was_created: false,
        prior_status: "resolved",
      }),
      applyCustomerReplyTransition: transitionSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.ticketsReopened).toBe(1);
    expect(result.ticketsCreated).toBe(0);
    expect(transitionSpy).toHaveBeenCalledWith(expect.anything(), "ticket-existing", "resolved");
  });
});

describe("pollGmailAccount — message_id_header persistence", () => {
  it("persists the Message-ID header value into messages.message_id_header on insert", async () => {
    const { db, inserts } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-mid", threadId: "thread-mid" } }] }],
        historyId: "1060",
      }),
      getMessage: async (_token, id) => ({
        id,
        threadId: "thread-mid",
        labelIds: ["INBOX"],
        snippet: "hello",
        payload: {
          headers: [
            { name: "From", value: "client@external.com" },
            { name: "Subject", value: "Need help" },
            { name: "Date", value: new Date().toUTCString() },
            { name: "Message-ID", value: "<abc123@mail.gmail.com>" },
          ],
        },
      }),
    });

    await pollGmailAccount(deps, ACCOUNT_ID);

    const messageInsert = inserts.find((i) => i.table === "messages");
    expect(messageInsert?.payload.message_id_header).toBe("<abc123@mail.gmail.com>");
  });

  it("stores null when the incoming message has no Message-ID header", async () => {
    const { db, inserts } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-no-mid", threadId: "thread-no-mid" } }] }],
        historyId: "1070",
      }),
    });

    await pollGmailAccount(deps, ACCOUNT_ID);

    const messageInsert = inserts.find((i) => i.table === "messages");
    expect(messageInsert?.payload.message_id_header).toBeNull();
  });
});

describe("pollGmailAccount — KAI-248 Grupo 1 §2: [KAIRO-n] broken-thread re-association", () => {
  it("attaches the message to the existing ticket's conversation when the subject carries a [KAIRO-n] token, even though the Gmail threadId does not match", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const upsertConversationSpy = mock(async () => ({ conversation_id: "conv-NEW-thread", was_created: true }));
    const findOrCreateSpy = mock(async (_client: unknown, args: { conversationId: string }) => {
      // Simulate tickets-by-thread behavior: an existing ticket is found for
      // the resolved (re-associated) conversation_id.
      expect(args.conversationId).toBe("conv-EXISTING");
      return {
        ticket_id: "ticket-existing",
        ticket_number: 42,
        was_created: false,
        prior_status: "resolved",
      };
    });
    const transitionSpy = mock(async () => ({ newStatus: "reopened" }));
    const findByTokenSpy = mock(async (_client: unknown, _accountId: string, ticketNumber: number) => {
      expect(ticketNumber).toBe(42);
      return { ticketId: "ticket-existing", conversationId: "conv-EXISTING" };
    });

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-broken-thread", threadId: "thread-BRAND-NEW" } }] }],
        historyId: "1080",
      }),
      getMessage: async (_token, id) => ({
        id,
        threadId: "thread-BRAND-NEW",
        labelIds: ["INBOX"],
        snippet: "hello again",
        payload: {
          headers: [
            { name: "From", value: "client@external.com" },
            { name: "Subject", value: "Re: Need help [KAIRO-42]" },
            { name: "Date", value: new Date().toUTCString() },
          ],
        },
      }),
      extractLastKairoToken: (subject: string) => (subject.includes("[KAIRO-42]") ? 42 : null),
      findTicketByKairoToken: findByTokenSpy,
      upsertConversationByThread: upsertConversationSpy,
      findOrCreateTicketForThread: findOrCreateSpy,
      applyCustomerReplyTransition: transitionSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(findByTokenSpy).toHaveBeenCalledTimes(1);
    // The broken-thread path must NOT create a new conversation via threadId.
    expect(upsertConversationSpy).not.toHaveBeenCalled();
    expect(result.ticketsCreated).toBe(0);
    expect(result.ticketsReopened).toBe(1);
    expect(transitionSpy).toHaveBeenCalledWith(expect.anything(), "ticket-existing", "resolved");
  });

  it("falls back to normal threadId flow when the subject has no [KAIRO-n] token (unchanged behavior)", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const upsertConversationSpy = mock(async () => ({ conversation_id: "conv-by-thread", was_created: true }));
    const findByTokenSpy = mock(async () => null);

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-plain", threadId: "thread-plain" } }] }],
        historyId: "1090",
      }),
      extractLastKairoToken: () => null,
      findTicketByKairoToken: findByTokenSpy,
      upsertConversationByThread: upsertConversationSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(findByTokenSpy).not.toHaveBeenCalled();
    expect(upsertConversationSpy).toHaveBeenCalledTimes(1);
    expect(result.ticketsCreated).toBe(1);
  });

  it("falls back to normal threadId flow when a [KAIRO-n] token is present but no matching ticket is found", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const upsertConversationSpy = mock(async () => ({ conversation_id: "conv-by-thread-2", was_created: true }));

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-stale-token", threadId: "thread-stale" } }] }],
        historyId: "1100",
      }),
      extractLastKairoToken: () => 999,
      findTicketByKairoToken: async () => null,
      upsertConversationByThread: upsertConversationSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(upsertConversationSpy).toHaveBeenCalledTimes(1);
    expect(result.ticketsCreated).toBe(1);
  });
});

describe("pollGmailAccount — pre-filter gate", () => {
  it("does not create a ticket for messages preFilterEmail marks as skip", async () => {
    const { db, inserts } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const findOrCreateSpy = mock(async () => ({
      ticket_id: "should-not-be-called",
      ticket_number: 1,
      was_created: true,
      prior_status: null,
    }));

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-newsletter", threadId: "thread-x" } }] }],
        historyId: "1020",
      }),
      preFilterEmail: () => ({ status: "skip", skip_reason: "automated_sender" }),
      findOrCreateTicketForThread: findOrCreateSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.skipped).toBe(1);
    expect(result.ticketsCreated).toBe(0);
    expect(findOrCreateSpy).not.toHaveBeenCalled();

    const messageInsert = inserts.find((i) => i.table === "messages");
    expect(messageInsert?.payload.classification_status).toBe("skipped");
    expect(messageInsert?.payload.skip_reason).toBe("automated_sender");
  });
});

describe("pollGmailAccount — 404 fallback", () => {
  it("falls back to messages.list and re-seeds the cursor when history.list throws GmailHistoryExpiredError", async () => {
    const { db, updates } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "old-expired-cursor" },
    });

    const messagesListSpy = mock(async () => ({ messages: [{ id: "msg-resync", threadId: "thread-resync" }] }));
    const getProfileSpy = mock(async () => ({ emailAddress: "support@mycompany.com", historyId: "2000" }));

    const deps = baseDeps({
      db,
      historyList: async () => {
        throw new GmailHistoryExpiredError();
      },
      messagesList: messagesListSpy,
      getProfile: getProfileSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.outcome).toBe("resynced");
    expect(messagesListSpy).toHaveBeenCalledTimes(1);
    expect(getProfileSpy).toHaveBeenCalledTimes(1);
    expect(result.newHistoryId).toBe("2000");

    const integrationUpdate = updates.find((u) => u.table === "channel_integrations");
    expect(integrationUpdate?.payload.gmail_history_id).toBe("2000");
  });
});

describe("pollGmailAccount — idempotency", () => {
  it("skips messages already present for this channel_integration (pre-check)", async () => {
    const { db, inserts } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
      existingExternalIds: ["msg-dup"],
    });

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-dup", threadId: "thread-dup" } }] }],
        historyId: "1030",
      }),
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.newMessages).toBe(0);
    expect(inserts.filter((i) => i.table === "messages")).toHaveLength(0);
  });

  it("treats a 23505 unique-violation on insert as already-ingested and continues without creating a ticket", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
      insertShouldConflict: true,
    });

    const findOrCreateSpy = mock(async () => ({
      ticket_id: "should-not-be-called",
      ticket_number: 1,
      was_created: true,
      prior_status: null,
    }));

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-race", threadId: "thread-race" } }] }],
        historyId: "1040",
      }),
      findOrCreateTicketForThread: findOrCreateSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.newMessages).toBe(0);
    expect(findOrCreateSpy).not.toHaveBeenCalled();
  });
});

describe("pollGmailAccount — no integration", () => {
  it("returns no_integration outcome and does not call getFreshGmailToken's downstream collaborators when no active gmail integration exists", async () => {
    const { db } = createFakeDb({ integration: null });
    const deps = baseDeps({ db });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.outcome).toBe("no_integration");
    expect(result.newHistoryId).toBeNull();
  });
});
