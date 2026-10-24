// Queue view — the three panes of every queue (Awaiting customer, Resolved,
// Escalated, AI Classification): the queue with its header, the open ticket and
// the context panel. Opening a view selects its first row.

import { useEffect, useRef, type ReactNode } from "react";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import type { Ticket } from "@kairo/types";
import { AiAssistant } from "@/components/ai-assistant";
import { TicketCard } from "@/components/ticket-card";
import { TicketDetail } from "@/components/ticket-detail";
import { useTicketListVisibility } from "@/hooks/use-ticket-list-visibility";
import { Box, EmptyState, QueueHeader, Skeleton, type QueueBarVariant } from "@kairo/ui";

interface QueueViewProps {
  title: string;
  count?: number | string | null;
  countLabel?: string;
  description?: string;
  barVariant?: QueueBarVariant;
  /** Filter-pill tabs of the bar (AI Classification). */
  bar?: ReactNode;
  tickets: readonly Ticket[];
  loading: boolean;
  empty: { title: string; description?: string };
  onOpen: (ticket: Ticket) => void;
  /** Third line of a row. */
  footer?: (ticket: Ticket) => ReactNode;
  /** Strip above the ticket bar (the AI proposal). */
  aboveTicket?: ReactNode;
}

export function QueueView({ title, count, countLabel, description, barVariant = "plain", bar, tickets, loading, empty, onOpen, footer, aboveTicket }: QueueViewProps) {
  const selectedTicketId = useTriageStore((state) => state.selectedTicketId);
  const selectTicket = useTriageStore((state) => state.selectTicket);
  const setQueueIds = useTriageStore((state) => state.setQueueIds);

  useEffect(() => {
    setQueueIds(tickets.map((ticket) => ticket.id));
  }, [tickets, setQueueIds]);

  // Opening a view (or switching its filter) selects the first row.
  const firstId = tickets[0]?.id ?? null;
  const lastFirst = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const selectedHere = selectedTicketId !== null && tickets.some((ticket) => ticket.id === selectedTicketId);
    if (!selectedHere && firstId && lastFirst.current !== firstId) {
      lastFirst.current = firstId;
      const first = tickets[0];
      if (first) onOpen(first);
    } else if (!firstId) {
      lastFirst.current = null;
      // An empty view shows no ticket from another one.
      if (selectedTicketId !== null) selectTicket(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, firstId]);

  const { hidden: listHidden, hideList } = useTicketListVisibility();

  return (
    <>
      {!listHidden && <Box id="ticket-list" width={372} flexShrink={0} display="flex" flexDirection="column" minHeight={0} backgroundColor="var(--kairo-color-surface)" borderRightWidth={1} borderRightColor="var(--k-border)" borderStyle="solid">
        <QueueHeader title={title} count={count} countLabel={countLabel} description={description} barVariant={barVariant} bar={bar} hideList={hideList} />
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" minHeight={0} scroll display="flex" flexDirection="column" gap={2} paddingTop={8} paddingHorizontal={8} paddingBottom={16}>
          {loading &&
            [0, 1, 2].map((index) => (
              <Box key={index} display="flex" flexDirection="column" gap={8} paddingVertical={12} paddingLeft={32} paddingRight={12}>
                <Skeleton height={12} width="70%" />
                <Skeleton height={10} width="45%" />
              </Box>
            ))}
          {!loading && tickets.length === 0 && <EmptyState title={empty.title} description={empty.description} paddingTop={110} />}
          {!loading &&
            tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} selected={selectedTicketId === ticket.id} onSelect={() => onOpen(ticket)} footer={footer?.(ticket)} />
            ))}
        </Box>
      </Box>}
      {aboveTicket ? (
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" flexDirection="column" minWidth={0} overflow="hidden">
          {aboveTicket}
          <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" overflow="hidden">
            <TicketDetail />
          </Box>
        </Box>
      ) : (
        <TicketDetail />
      )}
      <AiAssistant />
    </>
  );
}
