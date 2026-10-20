import { useTranslation } from "react-i18next";
import { useStatusTickets } from "@kairo/client-core/hooks/use-status-tickets";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { QueueView } from "@/components/queue-view";
import type { AppView } from "@/types";
import { RESOLVED_STATUSES, type Ticket } from "@kairo/types";

// Terminal statuses shown in this view — both are already rendered read-only
// by TicketDetail (KAI-25), so no per-ticket prop plumbing is needed here.
// RESOLVED_STATUSES ("resolved", "ai_resolved") comes from @kairo/types —
// shared with the API's related-history lookback (KAI-191).

interface ResolvedViewProps {
  onViewChange: (view: AppView) => void;
}

export function ResolvedView({ onViewChange: _onViewChange }: ResolvedViewProps) {
  const { t } = useTranslation("dashboard");
  const addTicket = useTriageStore((state) => state.addTicket);
  const selectTicket = useTriageStore((state) => state.selectTicket);

  const { tickets, loading } = useStatusTickets({
    channelPrefix: "resolved",
    statuses: RESOLVED_STATUSES,
    orderBy: "resolved_at",
    ascending: false,
  });

  // Open a ticket's thread without leaving this view: it goes into the triage
  // store so TicketDetail finds it, and renders read-only from its status.
  const openThread = (ticket: Ticket) => {
    addTicket(ticket);
    selectTicket(ticket.id);
  };

  return (
    <QueueView
      title={t("resolvedView.title")}
      count={tickets.length}
      countLabel={t("resolvedView.countLabel", { count: tickets.length })}
      description={t("resolvedView.subtitle")}
      tickets={tickets}
      loading={loading}
      empty={{ title: t("resolvedView.empty"), description: t("resolvedView.emptyHint") }}
      onOpen={openThread}
    />
  );
}
