import type { TicketType } from "@kairo/intelligence";

/** `ticket_proposals.status` for a freshly classified email. */
export type ProposalStatus = "auto_approved" | "pending";

/**
 * Whether a Tier 1 classification stands on its own or waits for a person.
 *
 * `support` stands: the KAI-93 bench measured that call at 92-97% across every
 * model. Every other class waits: that call lands at 32-83%, and its error is
 * the expensive one -- it buries a real customer request instead of adding a
 * spare ticket to the queue. See ADR-027.
 *
 * Tier 1 only. Tier 2 and Tier 3 run without a human anywhere near them and
 * have not decided this yet; when they do, whether the rule is the same is
 * something they measure, not something they inherit from here.
 */
export function tier1ProposalStatus(type: TicketType): ProposalStatus {
  return type === "support" ? "auto_approved" : "pending";
}
