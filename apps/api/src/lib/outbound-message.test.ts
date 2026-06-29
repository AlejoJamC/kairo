import { describe, it, expect, beforeEach } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markMessageSending, markMessageSent, markMessageFailed } from "./outbound-message.js";

// ---------------------------------------------------------------------------
// KAI-114: outbox bookkeeping helpers — drive messages.delivery_status through
// queued -> sending -> sent | failed (ADR-023 §1).
// ---------------------------------------------------------------------------

type AnyRow = Record<string, unknown>;

function makeMessagesMockClient(seed: AnyRow) {
  const row: AnyRow = { ...seed };

  const client = {
    from(table: string) {
      if (table !== "messages") throw new Error(`unexpected table ${table}`);
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                single() {
                  return Promise.resolve({ data: { ...row }, error: null });
                },
              };
            },
          };
        },
        update(updates: AnyRow) {
          return {
            eq(_col: string, _val: string) {
              Object.assign(row, updates);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    _row: row,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as SupabaseClient<any> & { _row: AnyRow };

  return client;
}

describe("markMessageSending", () => {
  it("transitions queued -> sending and increments send_attempts", async () => {
    const client = makeMessagesMockClient({ delivery_status: "queued", send_attempts: 0 });

    const result = await markMessageSending(client, "msg-1");

    expect(result.alreadySent).toBe(false);
    expect(client._row.delivery_status).toBe("sending");
    expect(client._row.send_attempts).toBe(1);
  });

  it("increments send_attempts on each retry", async () => {
    const client = makeMessagesMockClient({ delivery_status: "queued", send_attempts: 2 });

    await markMessageSending(client, "msg-1");

    expect(client._row.send_attempts).toBe(3);
  });

  it("is a no-op and reports alreadySent when the message is already sent", async () => {
    const client = makeMessagesMockClient({ delivery_status: "sent", send_attempts: 1 });

    const result = await markMessageSending(client, "msg-1");

    expect(result.alreadySent).toBe(true);
    // untouched — idempotency guard must not overwrite a sent message
    expect(client._row.delivery_status).toBe("sent");
    expect(client._row.send_attempts).toBe(1);
  });
});

describe("markMessageSent", () => {
  it("records provider identifiers and raw payload", async () => {
    const client = makeMessagesMockClient({ delivery_status: "sending", send_attempts: 1 });

    await markMessageSent(client, "msg-1", {
      providerMessageId: "gmail-msg-abc",
      providerThreadId: "gmail-thread-xyz",
    });

    expect(client._row.delivery_status).toBe("sent");
    expect(client._row.external_id).toBe("gmail-msg-abc");
    expect(client._row.thread_external_id).toBe("gmail-thread-xyz");
    expect(client._row.raw_payload).toEqual({
      provider_message_id: "gmail-msg-abc",
      provider_thread_id: "gmail-thread-xyz",
    });
  });

  it("persists message_id_header when the channel sender resolved one (KAI-248 Group 2)", async () => {
    const client = makeMessagesMockClient({ delivery_status: "sending", send_attempts: 1 });

    await markMessageSent(client, "msg-1", {
      providerMessageId: "gmail-msg-abc",
      providerThreadId: "gmail-thread-xyz",
      providerMessageIdHeader: "<sent-abc@mail.gmail.com>",
    });

    expect(client._row.message_id_header).toBe("<sent-abc@mail.gmail.com>");
  });

  it("omits message_id_header from the update when the sender could not resolve one", async () => {
    const client = makeMessagesMockClient({ delivery_status: "sending", send_attempts: 1, message_id_header: undefined });

    await markMessageSent(client, "msg-1", {
      providerMessageId: "gmail-msg-abc",
      providerThreadId: "gmail-thread-xyz",
      providerMessageIdHeader: null,
    });

    // Untouched — must not write `null` over a value, and must not error when absent.
    expect(client._row.message_id_header).toBeUndefined();
  });
});

describe("markMessageFailed", () => {
  let client: ReturnType<typeof makeMessagesMockClient>;

  beforeEach(() => {
    client = makeMessagesMockClient({ delivery_status: "sending", send_attempts: 4 });
  });

  it("marks the message failed with the error code and message", async () => {
    await markMessageFailed(client, "msg-1", { code: "INSUFFICIENT_SCOPE", message: "scope missing" });

    expect(client._row.delivery_status).toBe("failed");
    expect(client._row.send_error).toEqual({ code: "INSUFFICIENT_SCOPE", message: "scope missing" });
  });

  it("defaults the message to null when not provided", async () => {
    await markMessageFailed(client, "msg-1", { code: "SEND_FAILED" });

    expect(client._row.send_error).toEqual({ code: "SEND_FAILED", message: null });
  });

  it("never throws — swallows update errors so it is safe from onFailure/catch paths", async () => {
    const throwingClient = {
      from() {
        return {
          update() {
            return {
              eq() {
                throw new Error("db unreachable");
              },
            };
          },
        };
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as SupabaseClient<any>;

    await expect(markMessageFailed(throwingClient, "msg-1", { code: "SEND_FAILED" })).resolves.toBeUndefined();
  });
});
