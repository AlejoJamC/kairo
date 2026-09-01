import { supabase } from "./supabase.js";

export type TicketEventType =
  | "reply_sent"
  | "internal_note"
  | "ai_classified"
  | "human_classified"
  | "ai_proposal"
  | "ai_confirmed"
  | "ai_rejected"
  | "classification_corrected"
  | "customer_replied";  // KAI-165: customer sent a follow-up to the thread
// KAI-191: status_change, assignment, merge, merged_into, grouped,
// escalated and sla_breach used to live here too. State transitions now
// live only in ticket_state_history (via transitionTicketStatus()); the
// other five residual facts moved to ticket_activity_log — see
// emitTicketActivity() below.

export interface EmitTicketEventOptions {
  ticketId: string;
  authorId: string | null;
  eventType: TicketEventType;
  body?: string;
  isInternal?: boolean;
  metadata?: Record<string, unknown>;
}

export async function emitTicketEvent(opts: EmitTicketEventOptions): Promise<void> {
  const { error } = await supabase.from("ticket_events").insert({
    ticket_id: opts.ticketId,
    author_id: opts.authorId,
    event_type: opts.eventType,
    body: opts.body ?? null,
    is_internal: opts.isInternal ?? false,
    metadata: opts.metadata ?? null,
  });

  if (error) {
    // Non-fatal: event emission must not block the primary action
    console.error("[ticket-events] emit failed", { opts, error: error.message });
  }
}

// ---------------------------------------------------------------------------
// KAI-191: ticket_activity_log — append-only home for the residual ticket
// facts that used to ride in ticket_events (assignment, merge, merged_into,
// grouped, escalated). Same shape as emitTicketEvent, different table.
// ---------------------------------------------------------------------------

export type TicketActivityDomain = "tickets" | "deduplication" | "grouping" | "ans" | "escalation";

export type TicketActivityEventType =
  | "assignment"
  | "merge"
  | "merged_into"
  | "grouped"
  | "sla_breach"
  | "escalated";

export type TicketActivityActorType = "human" | "ai" | "customer" | "system";

export interface EmitTicketActivityOptions {
  accountId: string;
  ticketId: string;
  domain: TicketActivityDomain;
  eventType: TicketActivityEventType;
  actorType: TicketActivityActorType;
  actorUserId?: string | null;
  actorRef?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  idempotencyKey?: string;
}

export async function emitTicketActivity(opts: EmitTicketActivityOptions): Promise<void> {
  const { error } = await supabase.from("ticket_activity_log").insert({
    account_id: opts.accountId,
    ticket_id: opts.ticketId,
    domain: opts.domain,
    event_type: opts.eventType,
    actor_type: opts.actorType,
    actor_user_id: opts.actorUserId ?? null,
    actor_ref: opts.actorRef ?? null,
    reason: opts.reason ?? null,
    metadata: opts.metadata ?? null,
    occurred_at: opts.occurredAt ?? new Date().toISOString(),
    idempotency_key: opts.idempotencyKey ?? null,
  });

  if (error) {
    // Non-fatal: activity logging must not block the primary action
    console.error("[ticket-activity-log] emit failed", { opts, error: error.message });
  }
}
