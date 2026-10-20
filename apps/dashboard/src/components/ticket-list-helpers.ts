import { type Ticket } from "@kairo/client-core/stores/triage-store";
import { isTriageActive } from "@kairo/client-core/triage-status";
import { createTicketGroup, assignTicketsToGroup } from "@kairo/client-core/endpoints";

export interface FilterState {
  priority: string | null;
  type: string | null;
  category: string | null;
  status: "classified" | "unclassified" | null;
}

export const INITIAL_FILTERS: FilterState = {
  priority: null,
  type: null,
  category: null,
  status: null,
};

export function applyFilters(tickets: Ticket[], f: FilterState): Ticket[] {
  return tickets.filter((t) => {
    if (!isTriageActive(t.status)) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.type && t.ticket_type !== f.type) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.status === "classified" && !t.classified_at) return false;
    if (f.status === "unclassified" && t.classified_at) return false;
    return true;
  });
}

export interface ClassificationResult {
  type: string;
  priority: string;
  category: string;
  tone: string;
  reasoning: string;
  confidence: number;
}

export interface BatchTicketResult {
  ticket_id: string;
  status: "success" | "skipped" | "protected" | "failed";
  reason?: string;
  classification?: ClassificationResult;
}

export interface SimilarTicketRow {
  ticket_id: string;
  subject: string | null;
  similarity: number | null;
  group_id?: string | null;
}

// KAI-24 — group name is a backend-only field (not shown anywhere in the
// dashboard UI today), so it isn't run through i18n like user-facing labels.
export function deriveGroupName(subject: string | null | undefined): string {
  const trimmed = (subject ?? "").trim();
  if (trimmed) return trimmed.slice(0, 60);
  return `Grupo ${new Date().toISOString().slice(0, 10)}`;
}

export async function createGroupAndAssign(ticketIds: string[], name: string): Promise<string> {
  const createRes = await createTicketGroup(name);
  if (!createRes.ok) throw new Error("Failed to create group");
  const group = (await createRes.json()) as { id: string };

  const assignRes = await assignTicketsToGroup(group.id, ticketIds);
  if (!assignRes.ok) throw new Error("Failed to assign tickets to group");

  return group.id;
}

// KAI-108 — single entry point for both the manual action bar and the AI
// similarity callout: when one of the tickets being grouped already belongs
// to a group (preferredGroupId), reuse it instead of creating a new one —
// this is what was causing duplicate ticket_groups rows on repeated accepts.
// ticketIds here must already be filtered down to the tickets that actually
// need assigning (callers skip ids already sitting in preferredGroupId); an
// empty list with a preferredGroupId is a no-op success (all tickets were
// already grouped together).
export async function assignToGroupOrCreate(
  ticketIds: string[],
  preferredGroupId: string | null,
  name: string,
): Promise<string> {
  if (preferredGroupId) {
    if (ticketIds.length > 0) {
      const assignRes = await assignTicketsToGroup(preferredGroupId, ticketIds);
      if (!assignRes.ok) throw new Error("Failed to assign tickets to group");
    }
    return preferredGroupId;
  }
  return createGroupAndAssign(ticketIds, name);
}
