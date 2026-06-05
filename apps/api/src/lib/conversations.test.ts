import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-165: conversations.ts unit tests
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "acct-0001";
const CHANNEL_ID = "chan-0001";
const THREAD_ID  = "thread-abc";
const CONV_ID    = "conv-0001";

// We construct a mock supabase client inline — no module-level mock needed
// because conversations.ts accepts the client as a parameter.

function makeMockClient({ insertData = null as { id: string } | null, insertError = null, selectData = null as { id: string } | null, selectError = null } = {}) {
  const selectSingle = mock(async () => ({ data: selectData, error: selectError }));
  const selectObj = { single: selectSingle };
  const eqFn = mock(() => selectObj);
  // chain: .select().eq().eq().eq().single()
  const selectFn = mock(() => ({ eq: eqFn }));
  eqFn.mockReturnValue({ eq: eqFn, single: selectSingle });

  const insertSingle = mock(async () => ({ data: insertData, error: insertError }));
  const insertSelect = mock(() => ({ single: insertSingle }));
  const insertObj = { select: insertSelect };

  const fromFn = mock((table: string) => {
    if (table === "conversations") {
      return { insert: mock(() => insertObj), select: selectFn };
    }
    return {};
  });

  return { from: fromFn } as unknown as Parameters<typeof import("./conversations.js")["upsertConversationByThread"]>[0];
}

const { upsertConversationByThread } = await import("./conversations.js");

describe("upsertConversationByThread", () => {
  it("returns was_created=true when insert succeeds", async () => {
    const client = makeMockClient({ insertData: { id: CONV_ID } });
    const result = await upsertConversationByThread(client, {
      accountId: ACCOUNT_ID,
      channelIntegrationId: CHANNEL_ID,
      externalThreadId: THREAD_ID,
      customerExternalId: "alice@example.com",
    });
    expect(result.conversation_id).toBe(CONV_ID);
    expect(result.was_created).toBe(true);
  });

  it("returns was_created=false and re-reads on 23505 conflict", async () => {
    const client = makeMockClient({
      insertError: { code: "23505", message: "unique violation" },
      selectData: { id: CONV_ID },
    });
    const result = await upsertConversationByThread(client, {
      accountId: ACCOUNT_ID,
      channelIntegrationId: CHANNEL_ID,
      externalThreadId: THREAD_ID,
      customerExternalId: "alice@example.com",
    });
    expect(result.conversation_id).toBe(CONV_ID);
    expect(result.was_created).toBe(false);
  });

  it("throws on non-23505 insert error", async () => {
    const client = makeMockClient({
      insertError: { code: "42P01", message: "table does not exist" },
    });
    await expect(
      upsertConversationByThread(client, {
        accountId: ACCOUNT_ID,
        channelIntegrationId: CHANNEL_ID,
        externalThreadId: THREAD_ID,
        customerExternalId: "alice@example.com",
      })
    ).rejects.toThrow("[conversations] upsert failed");
  });
});
