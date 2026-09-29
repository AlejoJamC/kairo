// ---------------------------------------------------------------------------
// KAI-55 — drafts a knowledge article from a ticket that was just resolved.
//
// Gated by `enable_knowledge_candidates`. Idempotent per ticket: the event id
// carries the ticket id, and the draft carries a `ticket:<id>` tag that
// draftKnowledgeFromTicket checks before writing.
// ---------------------------------------------------------------------------

import { getFlag } from "@kairo/feature-flags";
import { inngest } from "../../lib/inngest.js";
import { draftKnowledgeFromTicket } from "../../lib/knowledge-candidate.js";

export const KNOWLEDGE_CANDIDATE_EVENT = "tickets/ticket.resolved";

export const knowledgeCandidate = inngest.createFunction(
  { id: "knowledge-candidate", retries: 2, triggers: [{ event: KNOWLEDGE_CANDIDATE_EVENT }] },
  async ({ event, step }) => {
    if (!getFlag("enable_knowledge_candidates")) return { skipped: "flag_disabled" };

    const { ticketId, accountId } = event.data as { ticketId: string; accountId: string };
    return step.run("draft-knowledge", () => draftKnowledgeFromTicket({ ticketId, accountId }));
  },
);
