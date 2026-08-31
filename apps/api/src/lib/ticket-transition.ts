// KAI-191 — the only function in the codebase allowed to change tickets.status.
//
// Wraps the apply_ticket_transition RPC (see
// supabase/migrations/20260831195533_create_apply_ticket_transition.sql),
// which atomically updates tickets.status and appends the corresponding
// ticket_state_history row in one transaction, validated against
// ticket_transition_rules (the DB-side mirror of ALLOWED_TRANSITIONS —
// see ticket-transition-rules-sql.ts for how the two are kept in sync).
//
// Every call site that used to write tickets.status directly now calls this
// instead. Do not add another writer of tickets.status outside this file.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketStatus } from "@kairo/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

export type TicketTransitionActorType = "human" | "ai" | "customer" | "system";

export interface TransitionTicketStatusArgs {
  ticketId: string;
  toState: TicketStatus;
  actorType: TicketTransitionActorType;
  trigger: string;
  /** Only set when a real person acted. */
  actorUserId?: string | null;
  /** Identifies a non-human actor (module or job name). */
  actorRef?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}

export type TransitionTicketStatusResult =
  | { outcome: "applied"; fromState: TicketStatus | null; toState: TicketStatus; historyId: string }
  | { outcome: "no_op"; fromState: TicketStatus | null; toState: TicketStatus }
  | { outcome: "invalid_transition"; message: string }
  | { outcome: "not_found" };

interface ApplyTicketTransitionRow {
  outcome: "applied" | "no_op";
  from_state: string | null;
  to_state: string;
  history_id: string | null;
}

// Custom SQLSTATEs raised by apply_ticket_transition() — see the migration
// for why these two outcomes raise instead of returning a row.
const NOT_FOUND_SQLSTATE = "KA404";
const INVALID_TRANSITION_SQLSTATE = "KA409";

/**
 * Atomically moves a ticket to a new status and records the transition in
 * ticket_state_history, via the apply_ticket_transition RPC.
 *
 * Same-state requests (toState === current status) and idempotency-key
 * replays both come back as `outcome: "no_op"` — neither is an error.
 */
export async function transitionTicketStatus(
  client: DbClient,
  args: TransitionTicketStatusArgs
): Promise<TransitionTicketStatusResult> {
  const { data, error } = await client.rpc("apply_ticket_transition", {
    p_ticket_id: args.ticketId,
    p_to_state: args.toState,
    p_actor_type: args.actorType,
    p_actor_user_id: args.actorUserId ?? null,
    p_actor_ref: args.actorRef ?? null,
    p_trigger: args.trigger,
    p_reason: args.reason ?? null,
    p_metadata: args.metadata ?? null,
    p_idempotency_key: args.idempotencyKey ?? null,
  });

  if (error) {
    if (error.code === NOT_FOUND_SQLSTATE) return { outcome: "not_found" };
    if (error.code === INVALID_TRANSITION_SQLSTATE) {
      return { outcome: "invalid_transition", message: error.message };
    }
    throw new Error(`[ticket-transition] apply_ticket_transition failed: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as ApplyTicketTransitionRow | undefined;
  if (!row) {
    throw new Error("[ticket-transition] apply_ticket_transition returned no row");
  }

  if (row.outcome === "no_op") {
    return {
      outcome: "no_op",
      fromState: row.from_state as TicketStatus | null,
      toState: row.to_state as TicketStatus,
    };
  }

  if (!row.history_id) {
    throw new Error("[ticket-transition] applied transition missing history_id");
  }

  return {
    outcome: "applied",
    fromState: row.from_state as TicketStatus | null,
    toState: row.to_state as TicketStatus,
    historyId: row.history_id,
  };
}
