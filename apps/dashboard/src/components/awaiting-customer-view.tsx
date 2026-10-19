import { useTranslation } from "react-i18next";
import { useStatusTickets } from "@kairo/client-core/hooks/use-status-tickets";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import type { AppView } from "@/types";
import { SlaBadge } from "@/components/sla-badge";
import type { Ticket } from "@kairo/types";
import { Box, Button, EmptyState, Icon, Spinner, Text } from "@kairo/ui";

// ---------------------------------------------------------------------------
// AwaitingCustomerView
// ---------------------------------------------------------------------------

interface AwaitingCustomerViewProps {
  onViewChange: (view: AppView) => void;
}

export function AwaitingCustomerView({ onViewChange: _onViewChange }: AwaitingCustomerViewProps) {
  const { t } = useTranslation("dashboard");
  const { addTicket, selectTicket, selectedTicketId, tickets: storeTickets } = useTriageStore();

  const { tickets, loading } = useStatusTickets({
    channelPrefix: "awaiting",
    statuses: ["awaiting_customer"] as const,
    orderBy: "sla_due_at",
    ascending: true,
  });

  const relativeTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "—";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t("ticketCard.timeJustNow");
    if (mins < 60) return t("ticketCard.timeMinutes_other", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("ticketCard.timeHours_other", { count: hrs });
    const days = Math.floor(hrs / 24);
    return t("ticketCard.timeDays_other", { count: days });
  };

  /**
   * Open a ticket's thread in the detail pane without leaving the awaiting view.
   * We add it to the triage store so TicketDetail can find it via selectedTicketId.
   */
  const openThread = (ticket: Ticket) => {
    addTicket(ticket);
    selectTicket(ticket.id);
  };

  // Determine whether a detail pane is open — only for tickets in this view
  const awaitingTicketIds = new Set(tickets.map((t) => t.id));
  const selectedIsAwaiting = selectedTicketId !== null && awaitingTicketIds.has(selectedTicketId);
  const selectedTicket = storeTickets.find((t) => t.id === selectedTicketId) ?? null;

  const showDetailPane = selectedIsAwaiting;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const listPane = (
    <Box display="flex" flexDirection="column" overflow="hidden" backgroundColor="var(--k-surface)" width={showDetailPane ? 360 : undefined} minWidth={showDetailPane ? 360 : undefined} flex={showDetailPane ? undefined : 1} borderRightWidth={showDetailPane ? 1 : 0} borderRightColor="var(--k-border)" flexShrink={0} borderStyle="solid">
      {/* Header */}
      <Box borderBottomWidth={1} borderBottomColor="var(--k-border)" backgroundColor="white" paddingVertical={16} paddingHorizontal={24} flexShrink={0} borderStyle="solid">
        <Text tag="h1" fontSize={18} fontWeight={600} color="var(--k-text-primary)" letterSpacing={-0.18} font="display" margin={0} display="block">
          {t("awaitingView.title")}
        </Text>
        <Text tag="p" marginTop={2} fontSize={13} color="var(--k-text-tertiary)" display="block">
          {t("awaitingView.subtitle")}
        </Text>
      </Box>

      {/* Content */}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll paddingVertical={20} paddingHorizontal={24}>
        {loading && (
          <Box display="flex" alignItems="center" justifyContent="center" paddingTop={64}>
            <Spinner size="lg" />
          </Box>
        )}

        {!loading && tickets.length === 0 && (
          <EmptyState title={t("awaitingView.empty")} paddingTop={80} />
        )}

        {!loading && tickets.length > 0 && (
          <Box tag="ul" display="flex" flexDirection="column" gap={8} listStyle="none" margin={0} padding={0}>
            {tickets.map((ticket) => {
              const isSelected = ticket.id === selectedTicketId;
              return (
                <Box tag="li" key={ticket.id} onClick={() => openThread(ticket)} display="flex" alignItems="center" gap={16} borderRadius={10} borderWidth={1} borderColor={isSelected ? "var(--k-accent)" : "var(--k-border)"} backgroundColor={isSelected ? "var(--k-accent-subtle)" : "white"} paddingVertical={12} paddingHorizontal={16} boxShadow="var(--kairo-shadow-xs)" cursor="pointer" transition="border-color 0.1s ease, background 0.1s ease" borderStyle="solid">
                  {/* Left: number + subject + client */}
                  <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
                    <Box display="flex" alignItems="center" gap={6} marginBottom={2}>
                      <Text fontSize={11} font="mono" color="var(--k-text-tertiary)" flexShrink={0}>
                        {t("awaitingView.ticketNumber", { number: ticket.ticket_number })}
                      </Text>
                      {(ticket.sla_breached || ticket.sla_due_at) && (
                        <SlaBadge slaDate={ticket.sla_due_at} breached={ticket.sla_breached ?? false} />
                      )}
                      {ticket.sla_breached && (
                        <Icon name="warning" size={13} color="var(--kairo-color-bad)" />
                      )}
                    </Box>
                    <Text tag="p" fontSize={13} fontWeight={500} color="var(--k-text-primary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" margin={0} display="block">
                      {ticket.subject}
                    </Text>
                    <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" margin={0} display="block">
                      {ticket.from_name ?? ticket.from_email}
                    </Text>
                  </Box>

                  {/* Center: last reply time */}
                  <Box flexShrink={0} display="flex" flexDirection="column" alignItems="flex-end" gap={2}>
                    <Text fontSize={10} font="mono" color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.5}>
                      {t("awaitingView.lastReply")}
                    </Text>
                    <Text fontSize={12} fontWeight={500} color="var(--k-text-secondary)">
                      {relativeTime(ticket.last_response_at)}
                    </Text>
                  </Box>

                  {/* Action */}
                  <Button
                    iconEnd={<Icon name="arrow" size={12} />}
                    onPress={() => openThread(ticket)}
                  >
                    {t("awaitingView.followUp")}
                  </Button>
                </Box>
              );
            })}
          </Box>
        )}
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
