/**
 * KAI-114 — Outbound message send worker (outbox consumer)
 *
 * Triggered by `messages/outbound.queued`, emitted by POST /v1/tickets/:id/reply
 * once it has persisted the message as `queued` (ADR-023 §1: persist-first,
 * never send-then-persist). Drives the message through
 * `queued -> sending -> sent | failed`, calling the channel-agnostic
 * `ChannelSender` (never the provider API directly — ADR-023 §2).
 *
 * Transient provider errors are rethrown so Inngest retries with backoff;
 * permanent errors (insufficient scope, no integration) raise
 * `NonRetriableError` to skip retries. Either way, `onFailure` runs once
 * Inngest has exhausted retries and marks the message `failed` for good —
 * the agent's text is never lost, and a definitive failure is always visible.
 */

import { NonRetriableError } from "inngest";
import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import { getFreshGmailToken, getGmailEmailByAccount } from "../../lib/gmail-token.js";
import { getChannelSender } from "../../lib/channels/index.js";
import { ChannelSendException } from "../../lib/channels/types.js";
import {
  markMessageSending,
  markMessageSent,
  markMessageFailed,
} from "../../lib/outbound-message.js";
import { PERMANENT_FAILURE_CODES, extractFailureCode } from "../../lib/outbound-send-failure.js";
import {
  startWorkerRun,
  finishWorkerRun,
  failWorkerRun,
} from "../../lib/contact-extraction/worker-run.js";

const WORKER_NAME = "outbound_message_send";

export const outboundMessageSend = inngest.createFunction(
  {
    id: "outbound-message-send",
    // Serialize per tenant — respects per-account Gmail rate limits (ADR-023 §1).
    concurrency: { limit: 5, key: "event.data.accountId" },
    retries: 4,
    triggers: [{ event: "messages/outbound.queued" }],
    onFailure: async ({ event, error }) => {
      // Called once Inngest has exhausted all retries (or hit a NonRetriableError).
      // This is the single place that marks a message definitively `failed`.
      const { messageId } = event.data.event.data;
      await markMessageFailed(supabase, messageId, {
        code: extractFailureCode(error),
        message: error.message,
      });
    },
  },
  async ({ event, step }) => {
    const { messageId, accountId, provider, to, subject, bodyPlain, bodyHtml, threadExternalId, inReplyToExternalId } = event.data;

    const runId = (await step.run("start-run", () =>
      startWorkerRun(supabase, {
        worker: WORKER_NAME,
        accountId,
        triggerEvent: "messages/outbound.queued",
        triggerPayload: event.data,
      }),
    )) as string;

    try {
      const { alreadySent } = await step.run("mark-sending", () => markMessageSending(supabase, messageId));

      if (alreadySent) {
        await step.run("finish-run-noop", () =>
          finishWorkerRun(supabase, runId, { skipped: "already_sent" }),
        );
        return { skipped: true };
      }

      const credential = await step.run("resolve-credential", async () => ({
        accessToken: await getFreshGmailToken(accountId),
        externalAccountId: await getGmailEmailByAccount(accountId),
      }));

      const sendResult = await step.run("send", async () => {
        try {
          return await getChannelSender(provider).send(
            { to, subject, bodyPlain, bodyHtml, threadExternalId, inReplyToExternalId },
            credential,
          );
        } catch (err) {
          if (err instanceof ChannelSendException && PERMANENT_FAILURE_CODES.has(err.code)) {
            throw new NonRetriableError(err.code, { cause: err });
          }
          throw err; // transient — Inngest retries with backoff
        }
      });

      await step.run("mark-sent", () => markMessageSent(supabase, messageId, sendResult));
      await step.run("finish-run", () => finishWorkerRun(supabase, runId, sendResult));

      return sendResult;
    } catch (err) {
      // Logged on every failed attempt (not just the final one) — onFailure
      // handles the definitive `failed` transition once retries are exhausted.
      await failWorkerRun(supabase, runId, err);
      throw err;
    }
  },
);
