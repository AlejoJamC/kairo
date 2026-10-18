import { useTranslation } from "react-i18next";
import { useStatusTickets } from "@kairo/client-core/hooks/use-status-tickets";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { TicketCard } from "@/components/ticket-card";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";
import { ESCALATED_STATUSES } from "@kairo/client-core/triage-status";
import { Box, EmptyState, Spinner, Text } from "@kairo/ui";

// Own bucket in triage-status.ts (STATUS_BUCKET), counted by the Escalado
// badge and not by Triage — mirrors ResolvedView's setup one status down.

interface EscalatedViewProps {
  onViewChange: (view: AppView) => void;
}

export function EscalatedView({ onViewChange: _onViewChange }: EscalatedViewProps) {
  const { t } = useTranslation("dashboard");
  const { addTicket, selectTicket, selectedTicketId, tickets: storeTickets } = useTriageStore();

  const { tickets, loading } = useStatusTickets({
    channelPrefix: "escalated",
    statuses: ESCALATED_STATUSES,
    orderBy: "updated_at",
    ascending: false,
  });

  /**
   * Open a ticket's thread in the detail pane without leaving this view. We add
   * it to the triage store so TicketDetail can find it via selectedTicketId —
   * escalated tickets are not read-only (unlike Resolved), so the full
   * reply/note bar renders as usual.
   */
  const openThread = (ticket: Ticket) => {
    addTicket(ticket);
    selectTicket(ticket.id);
  };

  // Determine whether a detail pane is open — only for tickets in this view
  const escalatedTicketIds = new Set(tickets.map((t) => t.id));
  const selectedIsEscalated = selectedTicketId !== null && escalatedTicketIds.has(selectedTicketId);
  const selectedTicket = storeTickets.find((t) => t.id === selectedTicketId) ?? null;

  const showDetailPane = selectedIsEscalated;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const listPane = (
    <Box display="flex" flexDirection="column" overflow="hidden" backgroundColor="var(--k-surface)" width={showDetailPane ? 360 : undefined} minWidth={showDetailPane ? 360 : undefined} flex={showDetailPane ? undefined : 1} borderRightWidth={showDetailPane ? 1 : 0} borderRightColor="var(--k-border)" flexShrink={0} borderStyle="solid">
      {/* Header */}
      <Box borderBottomWidth={1} borderBottomColor="var(--k-border)" backgroundColor="white" paddingVertical={16} paddingHorizontal={24} flexShrink={0} borderStyle="solid">
        <Text tag="h1" fontSize={18} fontWeight={600} color="var(--k-text-primary)" letterSpacing={-0.18} font="display" margin={0} display="block">
          {t("escalatedView.title")}
        </Text>
        <Text tag="p" marginTop={2} fontSize={13} color="var(--k-text-tertiary)" display="block">
          {t("escalatedView.subtitle")}
        </Text>
      </Box>

      {/* Content */}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll paddingBottom={8}>
        {loading && (
          <Box display="flex" alignItems="center" justifyContent="center" paddingTop={64}>
            <Spinner size="lg" />
          </Box>
        )}

        {!loading && tickets.length === 0 && (
          <EmptyState title={t("escalatedView.empty")} paddingTop={80} />
        )}

        {!loading &&
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              selected={selectedTicketId === ticket.id}
              onSelect={() => openThread(ticket)}
            />
          ))}
      </Box>
    </Box>
  );

  if (!showDetailPane) {
    return listPane;
  }

  return (
    <>
      {listPane}
      <TicketDetail />
      <AiAssistant
        customer={selectedTicket?.from_name ?? selectedTicket?.from_email ?? "—"}
      />
    </>
  );
}
