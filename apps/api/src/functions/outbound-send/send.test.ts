/**
 * Orchestration test for the outbound-message-send Inngest handler.
 *
 * Strategy mirrors apps/api/src/functions/contact-extraction/extract.test.ts:
 * the handler is a thin closure over real, independently-exported helpers
 * (markMessageSending/Sent/Failed, startWorkerRun/finishWorkerRun/failWorkerRun,
 * ChannelSendException, NonRetriableError, and the pure failure-classification
 * helpers in lib/outbound-send-failure.ts: PERMANENT_FAILURE_CODES,
 * extractFailureCode). We simulate its control flow by calling those real helpers
 * against a mock multi-table Supabase client + a fake ChannelSender, validating:
 *
 *  1. Happy path: queued -> sending -> sent, worker_runs succeeded.
 *  2. Permanent failures (INSUFFICIENT_SCOPE/NO_INTEGRATION) raise NonRetriableError
 *     and the message lands `failed` with the right send_error.code.
 *  3. Transient provider errors are rethrown untouched (Inngest retries) and the
 *     message is NOT marked failed yet.
 *  4. onFailure (run once Inngest exhausts retries) marks the message failed using
 *     extractFailureCode to recover the original ChannelSendException code.
 */

import { describe, it, expect } from "bun:test";
import { NonRetriableError } from "inngest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startWorkerRun, finishWorkerRun, failWorkerRun } from "../../lib/contact-extraction/worker-run.js";
import { markMessageSending, markMessageSent, markMessageFailed } from "../../lib/outbound-message.js";
import { ChannelSendException, type ChannelSender, type ChannelSendResult, type OutboundMessage, type ChannelCredential } from "../../lib/channels/types.js";
import { PERMANENT_FAILURE_CODES, extractFailureCode } from "../../lib/outbound-send-failure.js";

// ---------------------------------------------------------------------------
// Minimal in-memory multi-table Supabase mock (messages + worker_runs)
// ---------------------------------------------------------------------------

type AnyRow = Record<string, unknown>;

function makeMockClient(seedMessage: AnyRow) {
  const tables = new Map<string, Map<string, AnyRow>>([
    ["messages", new Map([["msg-1", { id: "msg-1", ...seedMessage }]])],
    ["worker_runs", new Map()],
  ]);
  let counter = 0;
  const getTable = (name: string) => tables.get(name)!;

  const client = {
    from(table: string) {
      return {
        insert(data: AnyRow) {
          return {
            select() {
              return {
                single() {
                  const id = `${table}-${++counter}`;
                  getTable(table).set(id, { id, ...data });
                  return Promise.resolve({ data: { id }, error: null });
                },
              };
            },
          };
        },
        select(_cols?: string) {
          return {
            eq(_col: string, val: string) {
              const t = getTable(table);
              return {
                single() {
                  const found = t.get(val) ?? Array.from(t.values()).find((r) => r.id === val);
                  return Promise.resolve(found ? { data: found, error: null } : { data: null, error: { message: "not found" } });
                },
                maybeSingle() {
                  const found = t.get(val) ?? Array.from(t.values()).find((r) => r.id === val);
                  return Promise.resolve({ data: found ?? null, error: null });
                },
              };
            },
          };
        },
        update(updates: AnyRow) {
          return {
            eq(_col: string, val: string) {
              const t = getTable(table);
              const key = t.has(val) ? val : Array.from(t.entries()).find(([, r]) => r.id === val)?.[0];
              if (key) t.set(key, { ...t.get(key)!, ...updates });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    _tables: tables,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as SupabaseClient<any> & { _tables: Map<string, Map<string, AnyRow>> };

  return client;
}

// ---------------------------------------------------------------------------
// Fake ChannelSender — controllable per test
// ---------------------------------------------------------------------------

function makeFakeSender(impl: (msg: OutboundMessage, cred: ChannelCredential) => Promise<ChannelSendResult>): ChannelSender {
  return { send: impl };
}

const MESSAGE: OutboundMessage = {
  to: "client@example.com",
  subject: "Re: Support ticket",
  bodyPlain: "Hello!",
  threadExternalId: "thread-abc",
};
const CREDENTIAL: ChannelCredential = { accessToken: "tok", externalAccountId: "agent@kairo.dev" };
const WORKER_NAME = "outbound_message_send";

/** Mirrors the handler's `try { ... } catch { failWorkerRun; throw }` body. */
async function runHandlerSimulation(client: ReturnType<typeof makeMockClient>, sender: ChannelSender) {
  const runId = await startWorkerRun(client, {
    worker: WORKER_NAME,
    accountId: "account-1",
    triggerEvent: "messages/outbound.queued",
    triggerPayload: { messageId: "msg-1" },
  });

  try {
    const { alreadySent } = await markMessageSending(client, "msg-1");
    if (alreadySent) {
      await finishWorkerRun(client, runId, { skipped: "already_sent" });
      return { runId, skipped: true };
    }

    let sendResult: ChannelSendResult;
    try {
      sendResult = await sender.send(MESSAGE, CREDENTIAL);
    } catch (err) {
      if (err instanceof ChannelSendException && PERMANENT_FAILURE_CODES.has(err.code)) {
        throw new NonRetriableError(err.code, { cause: err });
      }
      throw err;
    }

    await markMessageSent(client, "msg-1", sendResult);
    await finishWorkerRun(client, runId, sendResult);
    return { runId, sendResult };
  } catch (err) {
    await failWorkerRun(client, runId, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("outbound-message-send — happy path", () => {
  it("drives queued -> sending -> sent and finishes the worker run", async () => {
    const client = makeMockClient({ delivery_status: "queued", send_attempts: 0 });
    const sender = makeFakeSender(async () => ({ providerMessageId: "gmail-1", providerThreadId: "thread-abc" }));

    const { runId, sendResult } = await runHandlerSimulation(client, sender);

    expect(sendResult).toEqual({ providerMessageId: "gmail-1", providerThreadId: "thread-abc" });

    const message = client._tables.get("messages")?.get("msg-1");
    expect(message?.delivery_status).toBe("sent");
    expect(message?.external_id).toBe("gmail-1");
    expect(message?.send_attempts).toBe(1);

    const run = client._tables.get("worker_runs")?.get(runId!);
    expect(run?.status).toBe("succeeded");
  });

  it("persists the provider's Message-ID header for future threading (KAI-248 Group 2)", async () => {
    const client = makeMockClient({ delivery_status: "queued", send_attempts: 0 });
    const sender = makeFakeSender(async () => ({
      providerMessageId: "gmail-1",
      providerThreadId: "thread-abc",
      providerMessageIdHeader: "<sent-gmail-1@mail.gmail.com>",
    }));

    await runHandlerSimulation(client, sender);

    const message = client._tables.get("messages")?.get("msg-1");
    expect(message?.message_id_header).toBe("<sent-gmail-1@mail.gmail.com>");
  });

  it("is idempotent — skips sending when the message is already sent", async () => {
    const client = makeMockClient({ delivery_status: "sent", send_attempts: 1, external_id: "gmail-old" });
    const sender = makeFakeSender(async () => {
      throw new Error("must not be called");
    });

    const { runId, skipped } = await runHandlerSimulation(client, sender);

    expect(skipped).toBe(true);
    const message = client._tables.get("messages")?.get("msg-1");
    expect(message?.delivery_status).toBe("sent");
    expect(message?.external_id).toBe("gmail-old"); // untouched

    const run = client._tables.get("worker_runs")?.get(runId!);
    expect(run?.status).toBe("succeeded");
  });
});

describe("outbound-message-send — permanent failures", () => {
  for (const code of ["INSUFFICIENT_SCOPE", "NO_INTEGRATION"] as const) {
    it(`raises NonRetriableError carrying the ${code} cause and marks the run failed (not the message — onFailure does that)`, async () => {
      const client = makeMockClient({ delivery_status: "queued", send_attempts: 0 });
      const sender = makeFakeSender(async () => {
        throw new ChannelSendException(code);
      });

      let caught: unknown;
      try {
        await runHandlerSimulation(client, sender);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(NonRetriableError);
      expect((caught as NonRetriableError).message).toBe(code);
      expect(((caught as { cause?: unknown }).cause)).toBeInstanceOf(ChannelSendException);

      // The message stays `sending` here — onFailure is the single place that
      // marks it `failed` (avoids racy double-writes across retries).
      const message = client._tables.get("messages")?.get("msg-1");
      expect(message?.delivery_status).toBe("sending");

      const run = client._tables.get("worker_runs")?.get("worker_runs-1");
      expect(run?.status).toBe("failed");
    });
  }
});

describe("outbound-message-send — transient failures", () => {
  it("rethrows PROVIDER_ERROR untouched so Inngest retries with backoff", async () => {
    const client = makeMockClient({ delivery_status: "queued", send_attempts: 0 });
    const sender = makeFakeSender(async () => {
      throw new ChannelSendException("PROVIDER_ERROR", "Gmail 503");
    });

    let caught: unknown;
    try {
      await runHandlerSimulation(client, sender);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ChannelSendException);
    expect((caught as ChannelSendException).code).toBe("PROVIDER_ERROR");

    const message = client._tables.get("messages")?.get("msg-1");
    expect(message?.delivery_status).toBe("sending"); // not marked failed yet — may still succeed on retry
  });
});

describe("extractFailureCode — onFailure's recovery of the original failure reason", () => {
  it("recovers the cause's code from a NonRetriableError wrapper", () => {
    const cause = new ChannelSendException("INSUFFICIENT_SCOPE");
    const wrapped = new NonRetriableError("INSUFFICIENT_SCOPE", { cause });
    expect(extractFailureCode(wrapped)).toBe("INSUFFICIENT_SCOPE");
  });

  it("reads the code directly off a ChannelSendException thrown after exhausted retries", () => {
    expect(extractFailureCode(new ChannelSendException("PROVIDER_ERROR", "Gmail 503"))).toBe("PROVIDER_ERROR");
  });

  it("falls back to SEND_FAILED for errors outside the ChannelSendException vocabulary", () => {
    expect(extractFailureCode(new Error("credential resolution blew up"))).toBe("SEND_FAILED");
  });
});

describe("onFailure simulation — definitive failed transition", () => {
  it("marks the message failed with the recovered code once retries are exhausted", async () => {
    const client = makeMockClient({ delivery_status: "sending", send_attempts: 4 });
    const cause = new ChannelSendException("INSUFFICIENT_SCOPE");
    const error = new NonRetriableError("INSUFFICIENT_SCOPE", { cause });

    await markMessageFailed(client, "msg-1", { code: extractFailureCode(error), message: error.message });

    const message = client._tables.get("messages")?.get("msg-1");
    expect(message?.delivery_status).toBe("failed");
    expect(message?.send_error).toEqual({ code: "INSUFFICIENT_SCOPE", message: "INSUFFICIENT_SCOPE" });
  });
});
