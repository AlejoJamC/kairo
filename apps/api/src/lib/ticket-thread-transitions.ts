import type { SupabaseClient } from "@supabase/supabase-js";
import { emitTicketEvent } from "./ticket-events.js";
import { isValidTransition, isTicketStatus, type TicketStatus } from "./ticket-status-machine.js";
import { transitionTicketStatus } from "./ticket-transition.js";

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

  // Validate against the state machine — no fallback path. If priorStatus or
  // candidate isn't a registered transition, nothing is written (KAI-191:
  // this used to have a defensive "write anyway" branch for an unknown
  // state; removed — transitionTicketStatus() is the only writer of
  // tickets.status and it enforces this the same way regardless).
  if (
    candidate &&
    isTicketStatus(priorStatus ?? "") &&
    isTicketStatus(candidate) &&
    isValidTransition(priorStatus as TicketStatus, candidate as TicketStatus)
  ) {
    const transition = await transitionTicketStatus(client, {
      ticketId,
      toState: candidate as TicketStatus,
      actorType: "customer",
      actorRef: "ticket-thread-transitions",
      trigger: "customer_reply",
    });
    if (transition.outcome === "applied") {
      newStatus = candidate;
    } else if (transition.outcome !== "no_op") {
      console.error(
        `[ticket-thread-transitions] unexpected transition outcome for ticket ${ticketId}: ${transition.outcome}`
      );
    }
  }

  // Always bump last_response_at — unrelated to tickets.status, so it stays
  // a direct update rather than going through transitionTicketStatus().
  const { error: updateErr } = await client
    .from("tickets")
    .update({ last_response_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (updateErr) {
    console.error(
      `[ticket-thread-transitions] update failed for ticket ${ticketId}:`,
      updateErr.message
    );
  }

  // Emit customer_replied event. The status transition itself (if any) was
  // already recorded in ticket_state_history by transitionTicketStatus()
  // above — KAI-191: a transition lives in one place, not here too.
  await emitTicketEvent({
    ticketId,
    authorId: null,
    eventType: "customer_replied",
    metadata: {
      prior_status: priorStatus,
      new_status: newStatus,
    },
  });

  return { newStatus };
}
