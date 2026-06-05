import { supabase } from "./supabase.js";

export type TicketEventType =
  | "reply_sent"
  | "internal_note"
  | "status_change"
  | "assignment"
  | "merge"
  | "ai_classified"
  | "human_classified"
  | "ai_proposal"
  | "ai_confirmed"
  | "ai_rejected"
  | "sla_breach"
  | "escalated"
  | "grouped"
  | "classification_corrected"
  | "customer_replied"   // KAI-165: customer sent a follow-up to the thread
  | "merged_into";       // KAI-165: ticket merged into canonical during backfill

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
