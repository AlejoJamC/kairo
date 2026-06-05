import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import {
  startWorkerRun,
  finishWorkerRun,
  failWorkerRun,
} from "../../lib/contact-extraction/worker-run.js";
import { upsertConversationByThread } from "../../lib/conversations.js";
import { linkMessageToTicket } from "../../lib/ticket-messages.js";
import { emitTicketEvent } from "../../lib/ticket-events.js";

// ---------------------------------------------------------------------------
// Thread deduplication backfill (KAI-165)
//
// Groups existing tickets by (account_id, gmail_thread_id), keeps the oldest
// as canonical, marks the rest as merged, and links all messages to
// ticket_messages.
//
// Trigger: POST /api/v1/admin/backfill/thread-dedupe (requireRole owner/admin)
// Idempotent: safe to re-run.
// ---------------------------------------------------------------------------

export const threadDedupeBackfill = inngest.createFunction(
  {
    id: "thread-dedupe-backfill",
    concurrency: { limit: 1 },
    retries: 0,
    triggers: [{ event: "admin/thread-dedupe.triggered" }],
  },
  async ({ event, step, logger }) => {
    const accountId = event.data.accountId ?? null;

    // Start a worker_runs row for observability (KAI-225 infrastructure reuse).
    // worker_runs.account_id is nullable — pass null for "all accounts" runs.
    const runId = await step.run("start-run", () =>
      startWorkerRun(supabase, {
        worker: "thread_dedupe_backfill",
        accountId: accountId ?? "00000000-0000-0000-0000-000000000000", // placeholder for null-account runs
        triggerEvent: "admin/thread-dedupe.triggered",
        triggerPayload: event.data,
      })
    );

    try {
      // -----------------------------------------------------------------------
      // Step 1: Fetch all tickets that have a gmail_thread_id and are not merged
      // -----------------------------------------------------------------------
      const groups = (await step.run("find-groups", async () => {
        let q = supabase
          .from("tickets")
          .select(
            "id, account_id, gmail_thread_id, received_at, gmail_message_id, conversation_id, body_plain, from_email, from_name"
          )
          .not("gmail_thread_id", "is", null)
          .is("merged_into_ticket_id", null)
          .order("received_at", { ascending: true });

        if (accountId) q = q.eq("account_id", accountId);

        const { data, error } = await q;
        if (error) throw new Error(`find-groups query failed: ${error.message}`);
        return data ?? [];
      })) as Array<{
        id: string;
        account_id: string;
        gmail_thread_id: string;
        received_at: string;
        gmail_message_id: string | null;
        conversation_id: string | null;
        body_plain: string | null;
        from_email: string | null;
        from_name: string | null;
      }>;

      // -----------------------------------------------------------------------
      // Step 2: Group in memory by (account_id, gmail_thread_id)
      // -----------------------------------------------------------------------
      const grouped = new Map<string, typeof groups>();
      for (const t of groups) {
        const key = `${t.account_id}::${t.gmail_thread_id}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(t);
      }

      logger.info(`Found ${grouped.size} thread groups across ${groups.length} tickets`);

      let conversationsCreated = 0;
      let ticketsMerged = 0;
      let messagesRelinked = 0;

      // -----------------------------------------------------------------------
      // Step 3: Process each group
      // -----------------------------------------------------------------------
      await step.run("process-groups", async () => {
        for (const [key, group] of grouped) {
          const [acctId, threadId] = key.split("::");

          // Resolve channel_integration for this account
          const { data: ci } = await supabase
            .from("channel_integrations")
            .select("id")
            .eq("account_id", acctId)
            .eq("provider", "gmail")
            .limit(1)
            .maybeSingle();

          if (!ci) {
            logger.warn(`No channel_integration for account ${acctId} — skipping group ${threadId}`);
            continue;
          }

          // Canonical = oldest ticket in the group (already sorted by received_at ASC)
          const [canonical, ...dupes] = group;

          // Upsert conversation
          const { conversation_id, was_created: convCreated } =
            await upsertConversationByThread(supabase, {
              accountId: acctId,
              channelIntegrationId: ci.id,
              externalThreadId: threadId,
              customerExternalId: canonical.from_email ?? "",
              customerDisplayName: canonical.from_name,
            });
          if (convCreated) conversationsCreated++;

          // Compute max received_at across all tickets in group
          const maxReceivedAt = group.reduce(
            (max, t) => (t.received_at > max ? t.received_at : max),
            canonical.received_at
          );

          // Update canonical: conversation_id + last_response_at
          await supabase
            .from("tickets")
            .update({ conversation_id, last_response_at: maxReceivedAt })
            .eq("id", canonical.id);

          // Link canonical's message as origin
          if (canonical.gmail_message_id) {
            const { data: msg } = await supabase
              .from("messages")
              .select("id")
              .eq("channel_integration_id", ci.id)
              .eq("external_id", canonical.gmail_message_id)
              .maybeSingle();

            if (msg) {
              await linkMessageToTicket(supabase, {
                ticket_id: canonical.id,
                message_id: msg.id,
                is_origin: true,
              });
              // Patch conversation_id on message if missing
              await supabase
                .from("messages")
                .update({ conversation_id })
                .eq("id", msg.id)
                .is("conversation_id", null);
            }
          }

          // Process duplicates: mark merged + relink messages
          for (const d of dupes) {
            // NOTE: merged tickets have merged_into_ticket_id IS NOT NULL so they
            // are excluded from idx_tickets_account_conversation_active. Setting
            // conversation_id on them is safe — no unique conflict.
            await supabase
              .from("tickets")
              .update({
                merged_into_ticket_id: canonical.id,
                conversation_id,
              })
              .eq("id", d.id);

            if (d.gmail_message_id) {
              const { data: msg } = await supabase
                .from("messages")
                .select("id")
                .eq("channel_integration_id", ci.id)
                .eq("external_id", d.gmail_message_id)
                .maybeSingle();

              if (msg) {
                await linkMessageToTicket(supabase, {
                  ticket_id: canonical.id,
                  message_id: msg.id,
                  is_origin: false,
                });
                messagesRelinked++;

                await supabase
                  .from("messages")
                  .update({ conversation_id })
                  .eq("id", msg.id)
                  .is("conversation_id", null);
              }
            }

            // Emit merged_into event on the duplicate
            await emitTicketEvent({
              ticketId: d.id,
              authorId: null,
              eventType: "merged_into",
              metadata: {
                canonical_ticket_id: canonical.id,
                reason: "thread_dedupe_backfill",
              },
            });

            ticketsMerged++;
          }
        }
      });

      // -----------------------------------------------------------------------
      // Step 4: Finish
      // -----------------------------------------------------------------------
      await step.run("finish-run", () =>
        finishWorkerRun(supabase, runId, {
          groups_found: grouped.size,
          tickets_merged: ticketsMerged,
          messages_relinked: messagesRelinked,
          conversations_created: conversationsCreated,
        })
      );

      return {
        groups_found: grouped.size,
        tickets_merged: ticketsMerged,
        messages_relinked: messagesRelinked,
        conversations_created: conversationsCreated,
      };
    } catch (err) {
      await failWorkerRun(supabase, runId, err);
      throw err;
    }
  }
);
