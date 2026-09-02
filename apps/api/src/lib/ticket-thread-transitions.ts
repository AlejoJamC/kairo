import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidTransition, isTicketStatus, type TicketStatus } from "./ticket-status-machine.js";
import { transitionTicketStatus } from "./ticket-transition.js";
import { emitTicketActivity } from "./ticket-events.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Status transitions when a customer replies to a ticket thread.
 *
 * Rules (KAI-165 decision #2, corrected KAI-191 2026-09-02):
 *   awaiting_customer → in_progress  (was 'open' — wrong: the ticket is
 *                                      already owned, waiting on the
 *                                      customer isn't the same as unowned)
 *   resolved          → reopened
 *   all others        → no change (null)
 *
 * Also bumps tickets.last_response_at. The status transition itself, if any,
 * is recorded only by transitionTicketStatus() (into ticket_state_history) —
 * see the KAI-191 note below.
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
    candidate = "in_progress";
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
  } else if (priorStatus === "closed") {
    // KAI-191 decision 3: 'closed' is terminal — no candidate exists for it,
    // so the branch above never even calls transitionTicketStatus(). But a
    // customer replying to a closed case is signal, not noise, and must not
    // vanish without a trace. No transition occurs (there is nowhere legal
    // to go), so this is not a ticket_state_history row — it is an activity
    // fact, same shape as the other things that happen to a ticket without
    // moving its state.
    const { data: closedTicket } = await client
      .from("tickets")
      .select("account_id")
      .eq("id", ticketId)
      .maybeSingle();

    if (closedTicket?.account_id) {
      await emitTicketActivity({
        accountId: closedTicket.account_id,
        ticketId,
        domain: "tickets",
        eventType: "customer_reply_on_closed_ticket",
        actorType: "customer",
        actorRef: "ticket-thread-transitions",
      });
    } else {
      console.error(
        `[ticket-thread-transitions] could not resolve account_id to record closed-ticket reply for ticket ${ticketId}`
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

  // KAI-191: customer_replied used to be emitted here as a pointer event, but
  // it duplicated a fact `messages` already holds (the inbound reply row has
  // its own timestamp) — dropped outright, nothing replaces it. The status
  // transition itself (if any) was already recorded in ticket_state_history
  // by transitionTicketStatus() above.

  return { newStatus };
}
