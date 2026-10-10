import { describe, it, expect, mock } from "bun:test";
import { pollGmailAccount } from "./poll-account.js";
import { GmailHistoryExpiredError, GmailMessageNotFoundError, type DbClient, type GmailPollDeps } from "./types.js";
import { extractMailFacts } from "../email/mail-facts.js";
import type { EmailMetadata, PreFilterResult } from "../email/pre-filter.js";

// KAI-45 — a pre-filter stub still has to report what the envelope said, so
// the facts come from the real reader over the metadata the stub was handed
// rather than from a hand-written literal that could disagree with it.
function stubFilter(
  outcome: Omit<PreFilterResult, "facts">,
): (metadata: EmailMetadata) => PreFilterResult {
  return (metadata) => ({
    ...outcome,
    facts: extractMailFacts({ ...metadata, tenantMailbox: metadata.userEmail }),
  });
}

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
  existingRows?: { id: string; external_id: string; classification_status: string }[];
  cursorWriteFails?: boolean;
}

/**
 * Minimal fake Supabase client covering exactly the query shapes
 * pollGmailAccount / ingestMessages issue: channel_integrations select +
 * update, messages select/insert/update.
 */
function createFakeDb(opts: FakeDbOptions) {
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const inserts: { table: string; payload: Record<string, unknown> }[] = [];
  const upserts: { table: string; payload: Record<string, unknown> }[] = [];
  const existing = new Map<string, Record<string, unknown>>((opts.existingExternalIds ?? []).map((id) =>
    [id, { id: `stored-${id}`, external_id: id, classification_status: 'classified' }]));
  for (const row of opts.existingRows ?? []) existing.set(row.external_id, { ...row });

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
              eq() { return this; },
              is() { return this; },
              select: () => Promise.resolve({ data: opts.cursorWriteFails ? [] : [{ id: INTEGRATION_ID }],
                error: opts.cursorWriteFails ? { message: 'Synthetic cursor failure' } : null }),
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
                  data: ids.filter((id) => existing.has(id)).map((id) => existing.get(id)),
                  error: null,
                }),
              // recordClassificationFailure reads the prior attempt count.
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            };
          },
          // recordClassificationFailure persists the failed message.
          upsert(payload: Record<string, unknown>) {
            upserts.push({ table, payload });
            const key = String(payload.external_id);
            existing.set(key, { ...existing.get(key), ...payload });
            return Promise.resolve({ data: null, error: null });
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
                      : Promise.resolve((() => {
                          const id = `msg-${inserts.length}`;
                          existing.set(String(payload.external_id), { ...payload, id });
                          return { data: { id }, error: null };
                        })()),
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            return {
              eq: (_column: string, id: string) => {
                for (const [key, row] of existing) if (row.id === id) existing.set(key, { ...row, ...payload });
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table in fake db: ${table}`);
    },
  };

  return { db: db as unknown as DbClient, updates, inserts, upserts };
}

function baseDeps(overrides: Partial<GmailPollDeps>): GmailPollDeps {
  return {
    db: undefined as unknown as DbClient, // overridden per-test
    getFreshGmailToken: async () => "fresh-token",
    resolveClassifierContext: async () => ({
      tenantMailbox: "support@acme.com",
      tenantMailboxes: ["support@acme.com"],
      language: "es" as const,
    }),
    getProfile: async () => ({ emailAddress: "support@acme.com", historyId: "1000" }),
    historyList: async () => ({ history: [], historyId: "1001" }),
    messagesList: async () => ({ messages: [] }),
    getMessage: async (_token, id) => ({
      id,
      threadId: `thread-${id}`,
      labelIds: ["INBOX"],
      snippet: "hello",
      payload: {
        headers: [
          { name: "From", value: "client@outside.com" },
          { name: "Subject", value: "Need help" },
          { name: "Date", value: new Date().toUTCString() },
        ],
      },
    }),
    preFilterEmail: stubFilter({ status: "relevant" }),
    classifyEmail: async () => ({
      result: {
        type: "support",
        priority: "P2",
        category: "general",
        tone: "neutral",
        urgency: "medium",
        reasoning: "test",
        confidence: 0.9,
      },
      verdict: {
        actionability: "needs_action",
        subject_matter: "service",
        priority: "P2",
        category: "general",
        tone: "neutral",
        urgency: "medium",
        reasoning: "test",
        confidence: 0.9,
      },
      ensemble: null,
      abstain: false,
      promptVersion: "1.5.1",
      meta: {
        rawText: '{"stub":true}',
        model: "reported-model",
        usage: { promptTokens: 100, completionTokens: 20 },
        tokensPerSecond: null,
      },
      prompt: "resolved prompt",
    }),
    logLlmCall: () => undefined,
    configuredModel: () => "configured-model",
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
    getConversationCustomer: async () => ({ customerExternalId: "client@outside.com" }),
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
  it('requests knowledge only after linking the classified message and before advancing its cursor', async () => {
    const { db, updates } = createFakeDb({ integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: '1000' } });
    let linked = false;
    const requestKnowledge = mock(async (input: { accountId: string; ticketId: string; messageId: string }) => {
      expect(linked).toBe(true);
      expect(input).toMatchObject({ accountId: ACCOUNT_ID, messageId: 'msg-1' });
      expect(updates.some(row => row.table === 'channel_integrations')).toBe(false);
    });
    await pollGmailAccount(baseDeps({ db, requestKnowledge,
      linkMessageToTicket: async () => { linked = true; },
      historyList: async () => ({ history: [{ id: 'h1', messagesAdded: [{ message: { id: 'synthetic-message', threadId: 'synthetic-thread' } }] }], historyId: '1001' }),
    }), ACCOUNT_ID);
    expect(requestKnowledge).toHaveBeenCalledTimes(1);
    expect(updates.some(row => row.table === 'channel_integrations')).toBe(true);
  });
  it('keeps the cursor in place when the knowledge event could not be accepted', async () => {
    const { db, updates } = createFakeDb({ integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: '1000' } });
    await expect(pollGmailAccount(baseDeps({ db,
      requestKnowledge: async () => { throw new Error('Synthetic event delivery failure'); },
      historyList: async () => ({ history: [{ id: 'h1', messagesAdded: [{ message: { id: 'synthetic-message', threadId: 'synthetic-thread' } }] }], historyId: '1001' }),
    }), ACCOUNT_ID)).rejects.toThrow('Synthetic event delivery failure');
    expect(updates.some(row => row.table === 'channel_integrations')).toBe(false);
    expect(updates.some(row => row.payload.classification_status === 'classified')).toBe(false);
  });
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
            { name: "From", value: "client@outside.com" },
            { name: "Subject", value: "Need help" },
            { name: "Date", value: new Date().toUTCString() },
            { name: "Message-ID", value: "<synthetic-message@acme.com>" },
          ],
        },
      }),
    });

    await pollGmailAccount(deps, ACCOUNT_ID);

    const messageInsert = inserts.find((i) => i.table === "messages");
    expect(messageInsert?.payload.message_id_header).toBe("<synthetic-message@acme.com>");
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
            { name: "From", value: "client@outside.com" },
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

describe("pollGmailAccount — KAI-248 Grupo 4: sender validation on token re-association", () => {
  it("re-associates when the inbound sender matches the conversation's customer_external_id", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const upsertConversationSpy = mock(async () => ({ conversation_id: "conv-NEW-thread", was_created: true }));
    const findOrCreateSpy = mock(async (_client: unknown, args: { conversationId: string }) => {
      expect(args.conversationId).toBe("conv-EXISTING");
      return {
        ticket_id: "ticket-existing",
        ticket_number: 42,
        was_created: false,
        prior_status: "resolved",
      };
    });
    const transitionSpy = mock(async () => ({ newStatus: "reopened" }));
    const getConversationCustomerSpy = mock(async (_client: unknown, conversationId: string) => {
      expect(conversationId).toBe("conv-EXISTING");
      return { customerExternalId: "client@outside.com" };
    });

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-match", threadId: "thread-BRAND-NEW" } }] }],
        historyId: "1110",
      }),
      getMessage: async (_token, id) => ({
        id,
        threadId: "thread-BRAND-NEW",
        labelIds: ["INBOX"],
        snippet: "hello again",
        payload: {
          headers: [
            { name: "From", value: "client@outside.com" },
            { name: "Subject", value: "Re: Need help [KAIRO-42]" },
            { name: "Date", value: new Date().toUTCString() },
          ],
        },
      }),
      extractLastKairoToken: (subject: string) => (subject.includes("[KAIRO-42]") ? 42 : null),
      findTicketByKairoToken: async () => ({ ticketId: "ticket-existing", conversationId: "conv-EXISTING" }),
      getConversationCustomer: getConversationCustomerSpy,
      upsertConversationByThread: upsertConversationSpy,
      findOrCreateTicketForThread: findOrCreateSpy,
      applyCustomerReplyTransition: transitionSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(getConversationCustomerSpy).toHaveBeenCalledTimes(1);
    expect(upsertConversationSpy).not.toHaveBeenCalled();
    expect(result.ticketsReopened).toBe(1);
    expect(transitionSpy).toHaveBeenCalledWith(expect.anything(), "ticket-existing", "resolved");
  });

  it("rejects re-association and falls back to upsertConversationByThread when the sender does NOT match customer_external_id", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const upsertConversationSpy = mock(async () => ({ conversation_id: "conv-own-thread", was_created: true }));
    const findOrCreateSpy = mock(async () => ({
      ticket_id: "ticket-own",
      ticket_number: 7,
      was_created: true,
      prior_status: null,
    }));
    const findByTokenSpy = mock(async () => ({ ticketId: "ticket-victim", conversationId: "conv-VICTIM" }));
    const getConversationCustomerSpy = mock(async () => ({ customerExternalId: "client@outside.com" }));

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-attacker", threadId: "thread-attacker" } }] }],
        historyId: "1120",
      }),
      getMessage: async (_token, id) => ({
        id,
        threadId: "thread-attacker",
        labelIds: ["INBOX"],
        snippet: "trying to inject",
        payload: {
          headers: [
            { name: "From", value: "support@acme.com" },
            { name: "Subject", value: "Re: [KAIRO-7]" },
            { name: "Date", value: new Date().toUTCString() },
          ],
        },
      }),
      extractLastKairoToken: (subject: string) => (subject.includes("[KAIRO-7]") ? 7 : null),
      findTicketByKairoToken: findByTokenSpy,
      getConversationCustomer: getConversationCustomerSpy,
      upsertConversationByThread: upsertConversationSpy,
      findOrCreateTicketForThread: findOrCreateSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(findByTokenSpy).toHaveBeenCalledTimes(1);
    expect(getConversationCustomerSpy).toHaveBeenCalledTimes(1);
    // Rejected re-association — must fall through to the normal threadId flow,
    // never attaching the attacker's message to the victim's conversation.
    expect(upsertConversationSpy).toHaveBeenCalledTimes(1);
    expect(findOrCreateSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ conversationId: "conv-own-thread" })
    );
    expect(result.ticketsCreated).toBe(1);
  });

  it("treats sender/customer match as case-insensitive and whitespace-insensitive", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const upsertConversationSpy = mock(async () => ({ conversation_id: "conv-should-not-be-used", was_created: true }));
    const findOrCreateSpy = mock(async () => ({
      ticket_id: "ticket-existing",
      ticket_number: 10,
      was_created: false,
      prior_status: "resolved",
    }));
    const transitionSpy = mock(async () => ({ newStatus: "reopened" }));

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-casing", threadId: "thread-casing" } }] }],
        historyId: "1130",
      }),
      getMessage: async (_token, id) => ({
        id,
        threadId: "thread-casing",
        labelIds: ["INBOX"],
        snippet: "hi",
        payload: {
          headers: [
            // Padded + mixed-case — must still match "client@outside.com" below.
            { name: "From", value: " Client@Outside.COM " },
            { name: "Subject", value: "Re: [KAIRO-10]" },
            { name: "Date", value: new Date().toUTCString() },
          ],
        },
      }),
      extractLastKairoToken: (subject: string) => (subject.includes("[KAIRO-10]") ? 10 : null),
      findTicketByKairoToken: async () => ({ ticketId: "ticket-existing", conversationId: "conv-EXISTING" }),
      getConversationCustomer: async () => ({ customerExternalId: "client@outside.com" }),
      upsertConversationByThread: upsertConversationSpy,
      findOrCreateTicketForThread: findOrCreateSpy,
      applyCustomerReplyTransition: transitionSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(upsertConversationSpy).not.toHaveBeenCalled();
    expect(result.ticketsReopened).toBe(1);
    expect(transitionSpy).toHaveBeenCalledWith(expect.anything(), "ticket-existing", "resolved");
  });

  it("falls back to threadId flow without crashing when no [KAIRO-n] token is present (getConversationCustomer not called)", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });

    const upsertConversationSpy = mock(async () => ({ conversation_id: "conv-no-token", was_created: true }));
    const getConversationCustomerSpy = mock(async () => ({ customerExternalId: "client@outside.com" }));

    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-no-token", threadId: "thread-no-token" } }] }],
        historyId: "1140",
      }),
      extractLastKairoToken: () => null,
      getConversationCustomer: getConversationCustomerSpy,
      upsertConversationByThread: upsertConversationSpy,
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(getConversationCustomerSpy).not.toHaveBeenCalled();
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
      preFilterEmail: stubFilter({ status: "skip", skip_reason: "automated_sender" }),
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
    const getProfileSpy = mock(async () => ({ emailAddress: "support@acme.com", historyId: "2000" }));

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

  it("skips a message Gmail no longer has and still advances the cursor", async () => {
    const { db, inserts } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });
    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "synthetic-deleted", threadId: "synthetic-thread" } }] }],
        historyId: "1040",
      }),
      getMessage: async () => { throw new GmailMessageNotFoundError(); },
    });

    const result = await pollGmailAccount(deps, ACCOUNT_ID);

    expect(result.outcome).not.toBe("failed");
    expect(inserts.filter((i) => i.table === "messages")).toHaveLength(0);
    expect(result.ticketsCreated).toBe(0);
  });

  it("fails the run on any other message fetch error so the cursor is not advanced", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });
    const deps = baseDeps({
      db,
      historyList: async () => ({
        history: [{ id: "h1", messagesAdded: [{ message: { id: "synthetic-message", threadId: "synthetic-thread" } }] }],
        historyId: "1040",
      }),
      getMessage: async () => { throw new Error("Gmail request failed (HTTP 503)"); },
    });

    await expect(pollGmailAccount(deps, ACCOUNT_ID)).rejects.toThrow(/503/);
  });

  it("retries a conflicting insertion without treating it as completed", async () => {
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

    await expect(pollGmailAccount(deps, ACCOUNT_ID)).rejects.toThrow('poll will retry');

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

describe("pollGmailAccount — llm_calls logging", () => {
  const oneMessage = {
    historyList: async () => ({
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-log", threadId: "thread-log" } }] }],
      historyId: "1050",
    }),
  };

  it("writes one llm_calls entry per classified message, with the model the provider reported", async () => {
    const { db } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });
    const logLlmCall = mock((_entry: Parameters<GmailPollDeps["logLlmCall"]>[0]) => undefined);

    await pollGmailAccount(baseDeps({ db, ...oneMessage, logLlmCall }), ACCOUNT_ID);

    expect(logLlmCall).toHaveBeenCalledTimes(1);
    expect(logLlmCall.mock.calls[0]![0]).toMatchObject({
      feature: "email_classification",
      model: "reported-model",
      promptVersion: "1.5.1",
      promptText: "resolved prompt",
      promptTokens: 100,
      completionTokens: 20,
      accountId: ACCOUNT_ID,
    });
    expect(logLlmCall.mock.calls[0]![0].errorCode).toBeUndefined();
  });

  it("writes an error entry when the classifier fails, and still records the failure", async () => {
    const { db, upserts } = createFakeDb({
      integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
    });
    const logLlmCall = mock((_entry: Parameters<GmailPollDeps["logLlmCall"]>[0]) => undefined);

    const failure = await pollGmailAccount(
      baseDeps({
        db,
        ...oneMessage,
        logLlmCall,
        classifyEmail: async () => {
          throw new Error("model unavailable");
        },
      }),
      ACCOUNT_ID
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(upserts.some((u) => u.payload.classification_status === "failed")).toBe(true);
    expect(logLlmCall).toHaveBeenCalledTimes(1);
    expect(logLlmCall.mock.calls[0]![0]).toMatchObject({
      feature: "email_classification",
      model: "configured-model",
      errorCode: "LLM_ERROR",
      errorDetail: "model unavailable",
    });
  });
});


describe("pollGmailAccount — durable cursor and paging", () => {
  it("fails a rejected cursor write instead of reporting a completed poll", async () => {
    const { db } = createFakeDb({ integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" }, cursorWriteFails: true });
    await expect(pollGmailAccount(baseDeps({ db }), ACCOUNT_ID)).rejects.toThrow(/cursor persistence/);
  });

  it("reads all history pages and deduplicates messages across pages", async () => {
    const { db, inserts } = createFakeDb({ integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" } });
    const pageTokens: (string | undefined)[] = [];
    const result = await pollGmailAccount(baseDeps({ db, historyList: async (_token, _cursor, pageToken) => {
      pageTokens.push(pageToken);
      return { historyId: "1002", nextPageToken: pageToken ? undefined : "synthetic-page",
        history: [{ id: "synthetic-history", messagesAdded: [{ message: { id: "synthetic-message", threadId: "synthetic-thread" } }] }] };
    } }), ACCOUNT_ID);
    expect(pageTokens).toEqual([undefined, "synthetic-page"]);
    expect(inserts.length).toBe(1);
    expect(result.newMessages).toBe(1);
  });

  it("recovers an unfinished stored row without creating a duplicate", async () => {
    const { db, inserts } = createFakeDb({ integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" },
      existingRows: [{ id: "stored-message", external_id: "synthetic-message", classification_status: "failed" }] });
    const result = await pollGmailAccount(baseDeps({ db, historyList: async () => ({ historyId: "1002",
      history: [{ id: "synthetic-history", messagesAdded: [{ message: { id: "synthetic-message", threadId: "synthetic-thread" } }] }] }) }), ACCOUNT_ID);
    expect(result.ticketsCreated).toBe(1);
    expect(inserts.length).toBe(0);
  });

  it("classifies and stores the full body, not the snippet", async () => {
    const { db, inserts } = createFakeDb({ integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" } });
    const defaults = baseDeps({ db });
    const fullBody = "Synthetic full body that is longer than the snippet Gmail returns.";
    let classified = "";
    const deps = baseDeps({
      db,
      historyList: async () => ({ historyId: "1002",
        history: [{ id: "h", messagesAdded: [{ message: { id: "synthetic-message", threadId: "synthetic-thread" } }] }] }),
      getMessage: async (_token, id) => ({
        id, threadId: "synthetic-thread", labelIds: ["INBOX"], snippet: "Synthetic snippet",
        payload: {
          mimeType: "text/plain",
          headers: [
            { name: "From", value: "client@outside.com" },
            { name: "Subject", value: "Synthetic subject" },
            { name: "Date", value: new Date().toUTCString() },
          ],
          body: { data: Buffer.from(fullBody).toString("base64") },
        },
      }),
      classifyEmail: async (message, ...rest) => {
        classified = message.body;
        return defaults.classifyEmail(message, ...rest);
      },
    });

    await pollGmailAccount(deps, ACCOUNT_ID);

    expect(classified).toBe(fullBody);
    const stored = inserts.find((i) => i.table === "messages");
    expect(stored?.payload["body_plain"]).toBe(fullBody);
  });

  it("runs overlapping polls of one account once and gives both the same result", async () => {
    const { db } = createFakeDb({ integration: { id: INTEGRATION_ID, account_id: ACCOUNT_ID, gmail_history_id: "1000" } });
    let listings = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const deps = baseDeps({
      db,
      historyList: async () => {
        listings++;
        await gate;
        return { historyId: "1002",
          history: [{ id: "h", messagesAdded: [{ message: { id: "synthetic-message", threadId: "synthetic-thread" } }] }] };
      },
    });

    const first = pollGmailAccount(deps, ACCOUNT_ID);
    const second = pollGmailAccount(deps, ACCOUNT_ID);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(listings).toBe(1);
    expect(a).toEqual(b);
    expect(a.ticketsCreated).toBe(1);
  });
});
