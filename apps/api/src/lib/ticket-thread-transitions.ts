import type { SupabaseClient } from "@supabase/supabase-js";
import { emitTicketEvent } from "./ticket-events.js";
import { isValidTransition, isTicketStatus } from "./ticket-status-machine.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Status transitions when a customer replies to a ticket thread.
 *
 * Rules (KAI-165 decision #2):
 *   awaiting_customer → open
 *   resolved          → reopened
 *   all others        → no change (null)
 *
 * Also bumps tickets.last_response_at and emits ticket_events.
 */
export async function applyCustomerReplyTransition(
  client: DbClient,
  ticketId: string,
  priorStatus: string | null
): Promise<{ newStatus: string | null }> {
  let newStatus: string | null = null;

  // Determine candidate transition
  let candidate: string | null = null;
  if (priorStatus === "awaiting_customer") {
    candidate = "open";
  } else if (priorStatus === "resolved") {
    candidate = "reopened";
  }

  // Validate against state machine — skip if candidate is not a registered transition
  if (candidate && isTicketStatus(priorStatus ?? "") && isTicketStatus(candidate)) {
    if (isValidTransition(priorStatus as never, candidate as never)) {
      newStatus = candidate;
    }
  } else if (candidate) {
    // priorStatus or candidate not in machine yet — allow direct write (defensive)
    newStatus = candidate;
  }

  // Always bump last_response_at
  const updatePayload: Record<string, unknown> = {
    last_response_at: new Date().toISOString(),
  };
  if (newStatus) {
    updatePayload.status = newStatus;
  }

  const { error: updateErr } = await client
    .from("tickets")
    .update(updatePayload)
    .eq("id", ticketId);

  if (updateErr) {
    console.error(
      `[ticket-thread-transitions] update failed for ticket ${ticketId}:`,
      updateErr.message
    );
  }

  // Emit customer_replied event
  await emitTicketEvent({
    ticketId,
    authorId: null,
    eventType: "customer_replied",
    metadata: {
      prior_status: priorStatus,
      new_status: newStatus,
    },
  });

  // Emit status_change event only if status actually changed
  if (newStatus) {
    await emitTicketEvent({
      ticketId,
      authorId: null,
      eventType: "status_change",
      metadata: {
        from: priorStatus,
        to: newStatus,
        trigger: "customer_replied",
      },
    });
  }

  return { newStatus };
}
