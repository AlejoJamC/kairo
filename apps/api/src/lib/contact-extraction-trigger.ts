import { getFlag } from "@kairo/feature-flags";
import { inngest } from "./inngest.js";

/**
 * Asks the contact-extraction worker to read a brand-new ticket (fire-and-forget).
 * Every path that creates a ticket calls this, so a potential client is found
 * no matter which tier or sync created the ticket.
 */
export function triggerContactExtraction(ticketId: string, accountId: string, source: string): void {
  if (!getFlag("enable_contact_extraction")) return;
  inngest
    .send({ name: "tickets/ticket.created", data: { ticketId, accountId } })
    .catch((err: unknown) => {
      console.error(`[${source}] tickets/ticket.created send failed for ticket ${ticketId}:`, err);
    });
}
