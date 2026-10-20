import { TICKET_CATEGORIES, TICKET_TYPES } from "@kairo/types";
import type { TicketCategory, TicketType } from "@kairo/types";

/**
 * Maps a stored ticket_type onto the canonical union. Legacy rows can carry
 * "lead" (the former name of "prospect"); anything unknown falls back to
 * "support", the default classification.
 */
export function normalizeTicketType(raw: string | null | undefined): TicketType {
  const value = (raw ?? "").toLowerCase();
  if (value === "lead") return "prospect";
  return (TICKET_TYPES as readonly string[]).includes(value) ? (value as TicketType) : "support";
}

/** Returns the canonical category, or null when the stored value is not one. */
export function normalizeTicketCategory(raw: string | null | undefined): TicketCategory | null {
  const value = (raw ?? "").toLowerCase();
  return (TICKET_CATEGORIES as readonly string[]).includes(value) ? (value as TicketCategory) : null;
}
