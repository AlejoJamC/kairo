import { useTranslation } from "react-i18next";
import { useStatusTickets } from "@kairo/client-core/hooks/use-status-tickets";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { QueueView } from "@/components/queue-view";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";
import { Box, Icon, Pressable, Text } from "@kairo/ui";

// ---------------------------------------------------------------------------
// AwaitingCustomerView — tickets where the agent replied and the customer has
// not answered yet. Opening one fills the composer with a follow-up.
// ---------------------------------------------------------------------------

interface AwaitingCustomerViewProps {
  onViewChange: (view: AppView) => void;
}

export function AwaitingCustomerView({ onViewChange: _onViewChange }: AwaitingCustomerViewProps) {
  const { t } = useTranslation("dashboard");
  const addTicket = useTriageStore((state) => state.addTicket);
  const selectTicket = useTriageStore((state) => state.selectTicket);
  const setComposerPrefill = useTriageStore((state) => state.setComposerPrefill);

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
    return t("ticketCard.timeDays_other", { count: Math.floor(hrs / 24) });
  };

  // Open a ticket's thread without leaving this view. The composer gets a
  // follow-up the agent edits before sending.
  const openThread = (ticket: Ticket) => {
    addTicket(ticket);
    selectTicket(ticket.id);
    setComposerPrefill(t("awaitingView.followUpDraft", { name: (ticket.from_name ?? ticket.from_email ?? "").split(/\s+/)[0] }));
  };

  return (
    <QueueView
      title={t("awaitingView.title")}
      count={tickets.length}
      countLabel={t("awaitingView.countLabel", { count: tickets.length })}
      description={t("awaitingView.subtitle")}
      tickets={tickets}
      loading={loading}
      empty={{ title: t("awaitingView.empty"), description: t("awaitingView.emptyHint") }}
      onOpen={openThread}
      footer={(ticket) => (
        <Box display="flex" alignItems="center" gap={8} paddingLeft={22} width="100%">
          <Text font="mono" fontSize={9.5} letterSpacing={0.57} textTransform="uppercase" color="var(--k-text-tertiary)">
            {t("awaitingView.lastReply")}
          </Text>
          <Text fontSize={12} color="var(--k-text-secondary)">
            {relativeTime(ticket.last_response_at)}
          </Text>
          <Box flexGrow={1} />
          <Pressable onClick={() => openThread(ticket)} display="inline-flex" alignItems="center" gap={4} fontSize={12} color="var(--kairo-color-accent-ink)">
            {t("awaitingView.followUp")}
            <Icon name="arrow" size={12} />
          </Pressable>
        </Box>
      )}
    />
  );
}
