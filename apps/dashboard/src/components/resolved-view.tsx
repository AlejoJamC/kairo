import { useTranslation } from "react-i18next";
import { useStatusTickets } from "@kairo/client-core/hooks/use-status-tickets";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { TicketCard } from "@/components/ticket-card";
import type { AppView } from "@/types";
import { RESOLVED_STATUSES, type Ticket } from "@kairo/types";
import { Box, EmptyState, Spinner, Text } from "@kairo/ui";

// Terminal statuses shown in this view — both are already rendered read-only
// by TicketDetail (KAI-25), so no per-ticket prop plumbing is needed here.
// RESOLVED_STATUSES ("resolved", "ai_resolved") comes from @kairo/types —
// shared with the API's related-history lookback (KAI-191).

interface ResolvedViewProps {
  onViewChange: (view: AppView) => void;
}

export function ResolvedView({ onViewChange: _onViewChange }: ResolvedViewProps) {
  const { t } = useTranslation("dashboard");
  const { addTicket, selectTicket, selectedTicketId, tickets: storeTickets } = useTriageStore();

  const { tickets, loading } = useStatusTickets({
    channelPrefix: "resolved",
    statuses: RESOLVED_STATUSES,
    orderBy: "resolved_at",
    ascending: false,
  });

  /**
   * Open a ticket's thread in the detail pane without leaving this view. We add
   * it to the triage store so TicketDetail can find it via selectedTicketId —
   * it will render read-only automatically since the ticket's status is
   * resolved/ai_resolved.
   */
  const openThread = (ticket: Ticket) => {
    addTicket(ticket);
    selectTicket(ticket.id);
  };

  // Determine whether a detail pane is open — only for tickets in this view
  const resolvedTicketIds = new Set(tickets.map((t) => t.id));
  const selectedIsResolved = selectedTicketId !== null && resolvedTicketIds.has(selectedTicketId);
  const selectedTicket = storeTickets.find((t) => t.id === selectedTicketId) ?? null;

  const showDetailPane = selectedIsResolved;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const listPane = (
    <Box display="flex" flexDirection="column" overflow="hidden" backgroundColor="var(--k-surface)" width={showDetailPane ? 360 : undefined} minWidth={showDetailPane ? 360 : undefined} flex={showDetailPane ? undefined : 1} borderRightWidth={showDetailPane ? 1 : 0} borderRightColor="var(--k-border)" flexShrink={0} borderStyle="solid">
      {/* Header */}
      <Box borderBottomWidth={1} borderBottomColor="var(--k-border)" backgroundColor="white" paddingVertical={16} paddingHorizontal={24} flexShrink={0} borderStyle="solid">
        <Text tag="h1" fontSize={18} fontWeight={600} color="var(--k-text-primary)" letterSpacing={-0.18} font="display" margin={0} display="block">
          {t("resolvedView.title")}
        </Text>
        <Text tag="p" marginTop={2} fontSize={13} color="var(--k-text-tertiary)" display="block">
          {t("resolvedView.subtitle")}
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
          <EmptyState title={t("resolvedView.empty")} paddingTop={80} />
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
