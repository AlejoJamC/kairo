import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { useStatusTickets } from "@kairo/client-core/hooks/use-status-tickets";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { TicketCard } from "@/components/ticket-card";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";
import { ESCALATED_STATUSES } from "@kairo/client-core/triage-status";

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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--k-surface)",
        // Full width when no ticket selected; fixed width (like inbox) when detail pane is open
        width: showDetailPane ? 360 : undefined,
        minWidth: showDetailPane ? 360 : undefined,
        flex: showDetailPane ? undefined : 1,
        borderRight: showDetailPane ? "1px solid var(--k-border)" : undefined,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--k-border)", background: "white", padding: "16px 24px", flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--k-text-primary)", letterSpacing: "-0.01em", fontFamily: "var(--k-font-display)", margin: 0 }}>
          {t("escalatedView.title")}
        </h1>
        <p style={{ marginTop: 2, fontSize: 13, color: "var(--k-text-tertiary)" }}>
          {t("escalatedView.subtitle")}
        </p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 64 }}>
            <Clock style={{ width: 20, height: 20, color: "var(--k-text-tertiary)" }} className="animate-spin" />
          </div>
        )}

        {!loading && tickets.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>{t("escalatedView.empty")}</p>
          </div>
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
      </div>
    </div>
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
