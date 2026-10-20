import { useTranslation } from "react-i18next";
import { useStatusTickets } from "@kairo/client-core/hooks/use-status-tickets";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { QueueView } from "@/components/queue-view";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";
import { ESCALATED_STATUSES } from "@kairo/client-core/triage-status";

interface EscalatedViewProps {
  onViewChange: (view: AppView) => void;
}

export function EscalatedView({ onViewChange: _onViewChange }: EscalatedViewProps) {
  const { t } = useTranslation("dashboard");
  const addTicket = useTriageStore((state) => state.addTicket);
  const selectTicket = useTriageStore((state) => state.selectTicket);

  const { tickets, loading } = useStatusTickets({
    channelPrefix: "escalated",
    statuses: ESCALATED_STATUSES,
    orderBy: "updated_at",
    ascending: false,
  });

  const openThread = (ticket: Ticket) => {
    addTicket(ticket);
    selectTicket(ticket.id);
  };

  return (
    <QueueView
      title={t("escalatedView.title")}
      count={tickets.length}
      countLabel={t("escalatedView.countLabel", { count: tickets.length })}
      description={t("escalatedView.subtitle")}
      tickets={tickets}
      loading={loading}
      empty={{ title: t("escalatedView.empty"), description: t("escalatedView.emptyHint") }}
      onOpen={openThread}
    />
  );
}
