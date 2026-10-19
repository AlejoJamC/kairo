import { useRef } from "react";
import { Box, Skeleton } from "@kairo/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type Ticket } from "@kairo/client-core/stores/triage-store";
import { TicketCard } from "@/components/ticket-card";

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
// Virtualized ticket list — used when filtered count > 50
// ---------------------------------------------------------------------------

const ITEM_HEIGHT = 100;

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
