import { useRef } from "react";
import { Box, Pressable, Skeleton } from "@kairo/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type Ticket } from "@kairo/client-core/stores/triage-store";
import { TicketCard } from "@/components/ticket-card";
import { isTriageActive } from "@kairo/client-core/triage-status";
import { createTicketGroup, assignTicketsToGroup } from "@kairo/client-core/endpoints";

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

export function TicketSkeleton() {
  return (
    <Box display="flex" flexDirection="column" gap={8} borderBottomWidth={1} borderBottomColor="var(--k-border-subtle)" paddingVertical={12} paddingHorizontal={16} borderStyle="solid">
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Skeleton height={11} width={128} />
        <Skeleton height={11} width={32} />
      </Box>
      <Skeleton height={10} width="100%" />
      <Skeleton height={8} width="75%" />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// FilterChip — small toggle button
// ---------------------------------------------------------------------------

export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Pressable onClick={onClick} fontSize={11} paddingVertical={4} paddingHorizontal={8} borderRadius={4} backgroundColor={active ? "var(--k-surface-2)" : "transparent"} color={active ? "var(--k-text-primary)" : "var(--k-text-tertiary)"} font="mono" cursor="pointer" borderWidth={0} transition="background 0.1s ease, color 0.1s ease">
      {label}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// BatchTicketResult (mirrors API schema)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// KAI-24 — AI similarity row (raw find_similar_tickets RPC row, keyed
// ticket_id, not id). Backend already filters by similarity >= 0.85.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Virtualized ticket list — used when filtered count > 50
// ---------------------------------------------------------------------------

export const ITEM_HEIGHT = 100;

export function VirtualTicketList({
  tickets,
  selectedTicketId,
  correctedTicketIds,
  groupCounts,
  onSelect,
  selectedTicketIds,
  onToggleSelect,
  hasRelatedHistory,
  onOpenHistory,
}: {
  tickets: Ticket[];
  selectedTicketId: string | null;
  correctedTicketIds: Set<string>;
  groupCounts: Map<string, number>;
  onSelect: (id: string) => void;
  selectedTicketIds: Set<string>;
  onToggleSelect?: (id: string) => void;
  hasRelatedHistory: boolean;
  onOpenHistory: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  return (
    <Box ref={parentRef} flexGrow={1} flexShrink={1} flexBasis="0%" scroll minHeight={0} paddingBottom={8}>
      <Box height={rowVirtualizer.getTotalSize()} position="relative">
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const ticket = tickets[virtualRow.index];
          return (
            <Box key={virtualRow.key} position="absolute" top={0} left={0} width="100%" transform={`translateY(${virtualRow.start}px)`}>
              <TicketCard
                ticket={ticket}
                selected={selectedTicketId === ticket.id}
                onSelect={onSelect}
                isCorrected={correctedTicketIds.has(ticket.id)}
                groupCount={ticket.group_id ? (groupCounts.get(ticket.group_id) ?? 1) : 0}
                multiSelectMode={selectedTicketIds.size > 0}
                isChecked={selectedTicketIds.has(ticket.id)}
                onToggleSelect={onToggleSelect}
                hasRelatedHistory={selectedTicketId === ticket.id && hasRelatedHistory}
                onOpenHistory={onOpenHistory}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
