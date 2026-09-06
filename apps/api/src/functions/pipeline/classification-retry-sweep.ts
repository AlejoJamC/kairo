// ---------------------------------------------------------------------------
// Plan E — classification retry sweep.
//
// Deliberately independent Inngest function, decoupled from every business
// trigger (login, Gmail poll, onboarding) that dispatches tier1/tier2/tier3/
// incremental-sync/gmail-poll — those 5 call sites all persist the same
// terminal-looking classification_status: 'failed' with no automatic retry,
// which used to mean a message that failed once was permanently orphaned:
// no ticket, no conversation, invisible to any end user, and (before this
// change) not even enough content saved to reclassify it later.
//
// Runs on a schedule (default every 30 minutes, configurable via
// FEATURE_FLAG_CLASSIFICATION_RETRY_SWEEP_CRON_INTERVAL_MINUTES) and re-runs
// classification for every message still in classification_status: 'failed'
// — reusing the exact same concurrency/circuit-breaker/retry/error-taxonomy
// infrastructure tier1/tier2/tier3 already use, and the same
// conversation→ticket→message→ticket_messages chain on success.
// ---------------------------------------------------------------------------

import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import { env } from "../../env.js";
import { getNumericFlag } from "@kairo/feature-flags";
import { buildIntervalCronExpression } from "../../lib/cron-interval.js";
import { classifyEmailWithMeta } from "@kairo/intelligence";
import { getGmailEmailByAccount } from "../../lib/gmail-token.js";
import { upsertConversationByThread } from "../../lib/conversations.js";
import { findOrCreateTicketForThread } from "../../lib/tickets-by-thread.js";
import { linkMessageToTicket } from "../../lib/ticket-messages.js";
import { createSemaphore } from "../../lib/semaphore.js";
import { createCircuitBreaker } from "../../lib/circuit-breaker.js";
import { withRetry } from "../../lib/retry.js";
import { recordClassificationFailure } from "../../lib/classification-outcome.js";
import { logLlmCall } from "../../lib/llm-logging.js";
import { resolveModelVersion } from "../../lib/model-version.js";
import { computePriorityScore, DEFAULT_WEIGHTS } from "../../lib/scoring.js";

const intervalMinutes = Math.max(
  1,
  Math.floor(getNumericFlag("classification_retry_sweep_cron_interval_minutes"))
);
const CRON_EXPRESSION = buildIntervalCronExpression(intervalMinutes);

// Bounded per tick so one sweep can't monopolize FAST_PATH_LLM_CONCURRENCY
// against live onboarding/poll traffic — the remainder waits for the next tick.
const SWEEP_BATCH_SIZE = 50;

interface FailedMessageRow {
  id: string;
  account_id: string;
  channel_integration_id: string;
  external_id: string;
  thread_external_id: string | null;
  subject: string | null;
  body_plain: string | null;
  body_html: string | null;
  snippet: string | null;
  sender_external_id: string | null;
  sender_display_name: string | null;
  message_id_header: string | null;
  received_at: string;
}

export const classificationRetrySweep = inngest.createFunction(
  {
    id: "classification-retry-sweep",
    retries: 0,
    triggers: [{ cron: CRON_EXPRESSION }],
  },
  async ({ step, logger }) => {
    const failedMessages = (await step.run("list-failed-messages", async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, account_id, channel_integration_id, external_id, thread_external_id, subject, body_plain, body_html, snippet, sender_external_id, sender_display_name, message_id_header, received_at"
        )
        .eq("classification_status", "failed")
        .order("last_classification_attempt_at", { ascending: true, nullsFirst: true })
        .limit(SWEEP_BATCH_SIZE);

      if (error) {
        throw new Error(`[classification-retry-sweep] failed to list messages: ${error.message}`);
      }
      return (data ?? []) as FailedMessageRow[];
    })) as FailedMessageRow[];

    if (failedMessages.length === 0) {
      return { retried: 0, recovered: 0, stillFailed: 0 };
    }

    const result = await step.run("retry-classification", async () => {
      const llmSemaphore = createSemaphore(env.FAST_PATH_LLM_CONCURRENCY);
      const circuitBreaker = createCircuitBreaker(env.FAST_PATH_CIRCUIT_BREAKER_THRESHOLD);
      const userEmailCache = new Map<string, string>();

      let recovered = 0;
      let stillFailed = 0;

      const promises = failedMessages.map((message) =>
        (async () => {
          if (circuitBreaker.isOpen()) {
            stillFailed++;
            return;
          }

          const subject = message.subject ?? "";
          const classifierBody = message.body_plain || message.snippet || "";
          const from = message.sender_external_id ?? "";
          const llmStart = Date.now();

          let userEmail = userEmailCache.get(message.account_id);
          if (userEmail === undefined) {
            userEmail = await getGmailEmailByAccount(message.account_id);
            userEmailCache.set(message.account_id, userEmail);
          }

          try {
            const { result: classification, meta, prompt, promptVersion } = await withRetry(llmSemaphore, () =>
              classifyEmailWithMeta(
                { subject, body: classifierBody, from, tenantMailbox: userEmail },
                { context: { accountId: message.account_id } }
              )
            );
            circuitBreaker.recordSuccess();

            logLlmCall({
              feature: "email_classification",
              model: meta.model,
              promptVersion,
              promptText: prompt,
              responseText: meta.rawText,
              promptTokens: meta.usage.promptTokens,
              completionTokens: meta.usage.completionTokens,
              confidenceScore: classification.confidence,
              latencyMs: Date.now() - llmStart,
              triggeredByUserId: null,
              accountId: message.account_id,
            });

            const classified_at = new Date().toISOString();
            const priorityScore = computePriorityScore(
              {
                type: classification.type,
                tone: classification.tone,
                plan: "none",
                receivedAt: message.received_at,
                recentTicketCount: 0,
              },
              DEFAULT_WEIGHTS
            );

            const { conversation_id } = await upsertConversationByThread(supabase, {
              accountId: message.account_id,
              channelIntegrationId: message.channel_integration_id,
              externalThreadId: message.thread_external_id ?? message.external_id,
              customerExternalId: from,
              customerDisplayName: message.sender_display_name,
            });

            const ticketResult = await findOrCreateTicketForThread(supabase, {
              accountId: message.account_id,
              conversationId: conversation_id,
              originatingUserId: null,
              classification: {
                type: classification.type,
                category: classification.category,
                priority: classification.priority,
                tone: classification.tone,
                confidence: classification.confidence,
                reasoning: classification.reasoning,
              },
              originMessage: {
                subject,
                from_email: from,
                from_name: message.sender_display_name,
                to_email: null,
                body_plain: message.body_plain,
                body_html: message.body_html,
                snippet: message.snippet,
                gmail_message_id: message.external_id,
                gmail_thread_id: message.thread_external_id ?? message.external_id,
                received_at: message.received_at,
              },
              classifiedAt: classified_at,
              classificationTier: 0,
              priorityScore,
            });

            await supabase
              .from("messages")
              .update({
                conversation_id,
                classification_status: "classified",
                classified_at,
                last_classification_attempt_at: classified_at,
              })
              .eq("id", message.id);

            await linkMessageToTicket(supabase, {
              ticket_id: ticketResult.ticket_id,
              message_id: message.id,
              is_origin: ticketResult.was_created,
            });

            recovered++;
          } catch (err) {
            circuitBreaker.recordFailure();
            stillFailed++;
            const detail = err instanceof Error ? err.message : String(err);
            logLlmCall({
              feature: "email_classification",
              model: resolveModelVersion(),
              promptText: `${from} | ${subject}`,
              latencyMs: Date.now() - llmStart,
              errorCode: "LLM_ERROR",
              errorDetail: detail,
              triggeredByUserId: null,
              accountId: message.account_id,
            });

            await recordClassificationFailure({
              supabase,
              accountId: message.account_id,
              channelIntegrationId: message.channel_integration_id,
              externalId: message.external_id,
              threadExternalId: message.thread_external_id,
              receivedAt: message.received_at,
              senderExternalId: message.sender_external_id,
              senderDisplayName: message.sender_display_name,
              subject,
              snippet: message.snippet,
              bodyPlain: message.body_plain,
              bodyHtml: message.body_html,
              messageIdHeader: message.message_id_header,
              processingTier: 0,
              err,
              maxAttempts: env.CLASSIFICATION_MAX_ATTEMPTS,
            });
          }
        })()
      );

      await Promise.allSettled(promises);
      return { retried: failedMessages.length, recovered, stillFailed };
    });

    logger.info(`[classification-retry-sweep] ${JSON.stringify(result)}`);
    return result;
  }
);
