import { supabase } from "./supabase.js";

// KAI-191: the old catch-all events table used to hold status_change,
// assignment, merge, merged_into, grouped, escalated, sla_breach, reply_sent,
// customer_replied, internal_note and six classification event types. Every
// one of them has since moved to a purpose-shaped home: state transitions
// live only in ticket_state_history (via transitionTicketStatus());
// assignment/merge/merged_into/grouped/escalated/sla_breach live in
// ticket_activity_log (see emitTicketActivity() below); internal_note moved
// to ticket_notes; reply_sent and customer_replied were dropped outright (a
// reply already inserts its own row into `messages` — the pointer event was
// a duplicate, not a fact); and the six classification types moved to
// ticket_classification_history (see emitTicketClassification() below). The
// old table itself has since been dropped — ticket_lifecycle_timeline is
// the read-side successor, unioning these purpose-shaped tables back into
// one ordered stream per ticket.

// ---------------------------------------------------------------------------
// KAI-191: ticket_activity_log — append-only home for the residual ticket
// facts that used to ride in the old events table (assignment, merge,
// merged_into, grouped, escalated).
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

// ---------------------------------------------------------------------------
// KAI-191: ticket_classification_history — append-only ledger of classification
// decisions on a ticket's attributes. Both the AI's own tier1/tier2/tier3/
// incremental-sync classification passes and human review actions (confirm,
// reject, manual classify, correction) write here, one row per dimension
// actually changed — a pass that touches four attributes leaves four rows,
// not one row with four fields buried in metadata.
// ---------------------------------------------------------------------------

export type ClassificationDimension =
  | "category"
  | "priority"
  | "sentiment"
  | "emotion"
  | "ticket_type";

export interface EmitTicketClassificationOptions {
  accountId: string;
  ticketId: string;
  actorType: TicketActivityActorType;
  actorUserId?: string | null;
  actorRef?: string | null;
  dimension: ClassificationDimension;
  fromValue?: string | null;
  toValue?: string | null;
  confidence?: number | null;
  modelVersion?: string | null;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export async function emitTicketClassification(opts: EmitTicketClassificationOptions): Promise<void> {
  const { error } = await supabase.from("ticket_classification_history").insert({
    account_id: opts.accountId,
    ticket_id: opts.ticketId,
    actor_type: opts.actorType,
    actor_user_id: opts.actorUserId ?? null,
    actor_ref: opts.actorRef ?? null,
    dimension: opts.dimension,
    from_value: opts.fromValue ?? null,
    to_value: opts.toValue ?? null,
    confidence: opts.confidence ?? null,
    model_version: opts.modelVersion ?? null,
    occurred_at: opts.occurredAt ?? new Date().toISOString(),
    metadata: opts.metadata ?? null,
    idempotency_key: opts.idempotencyKey ?? null,
  });

  if (error) {
    // Non-fatal: classification logging must not block the primary action
    console.error("[ticket-classification-history] emit failed", { opts, error: error.message });
  }
}
