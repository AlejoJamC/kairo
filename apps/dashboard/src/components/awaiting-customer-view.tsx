import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// SLA badge
// ---------------------------------------------------------------------------

function SlaBadge({ slaDate, breached }: { slaDate: string | null | undefined; breached: boolean }) {
  const { t } = useTranslation("dashboard");

  if (breached) {
    return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#FEF2F2", color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {t("ticketCard.slaBreached")}
      </span>
    );
  }
  if (!slaDate) return null;

  const diff = new Date(slaDate).getTime() - Date.now();
  if (diff <= 0) {
    return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#FEF2F2", color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {t("ticketCard.slaBreached")}
      </span>
    );
  }

  const totalMins = Math.floor(diff / 60_000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const label = hrs > 0
    ? t("ticketCard.slaHours_other", { count: hrs, minutes: mins })
    : t("ticketCard.slaMinutes_other", { count: totalMins });

  return (
    <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 4, background: "var(--k-surface-2)", color: "var(--k-text-tertiary)" }}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AwaitingCustomerView
// ---------------------------------------------------------------------------

interface AwaitingCustomerViewProps {
  onViewChange: (view: AppView) => void;
}

export function AwaitingCustomerView({ onViewChange: _onViewChange }: AwaitingCustomerViewProps) {
  const { t } = useTranslation("dashboard");
  const { user, accountId } = useAuth();
  const { addTicket, selectTicket, selectedTicketId, tickets: storeTickets } = useTriageStore();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from("tickets")
        .select("*")
        .eq("status", "awaiting_customer");
      if (accountId) query = query.eq("account_id", accountId);
      const { data, error } = await query
        .order("sla_due_at", { ascending: true, nullsFirst: false });

      if (!error && data) setTickets(data as Ticket[]);
      setLoading(false);
    })();
  }, [user, accountId]);

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
          {t("awaitingView.title")}
        </h1>
        <p style={{ marginTop: 2, fontSize: 13, color: "var(--k-text-tertiary)" }}>
          {t("awaitingView.subtitle")}
        </p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 64 }}>
            <Clock style={{ width: 20, height: 20, color: "var(--k-text-tertiary)" }} className="animate-spin" />
          </div>
        )}

        {!loading && tickets.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>{t("awaitingView.empty")}</p>
          </div>
        )}

        {!loading && tickets.length > 0 && (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
            {tickets.map((ticket) => {
              const isSelected = ticket.id === selectedTicketId;
              return (
                <li
                  key={ticket.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    borderRadius: 10,
                    border: isSelected ? "1px solid var(--k-accent)" : "1px solid var(--k-border)",
                    background: isSelected ? "var(--k-accent-subtle)" : "white",
                    padding: "12px 16px",
                    boxShadow: "0 1px 2px rgba(9,9,11,0.04)",
                    cursor: "pointer",
                    transition: "border-color 0.1s ease, background 0.1s ease",
                  }}
                  onClick={() => openThread(ticket)}
                >
                  {/* Left: number + subject + client */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", flexShrink: 0 }}>
                        {t("awaitingView.ticketNumber", { number: ticket.ticket_number })}
                      </span>
                      {(ticket.sla_breached || ticket.sla_due_at) && (
                        <SlaBadge slaDate={ticket.sla_due_at} breached={ticket.sla_breached ?? false} />
                      )}
                      {ticket.sla_breached && (
                        <AlertTriangle style={{ width: 13, height: 13, color: "#EF4444", flexShrink: 0 }} />
                      )}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                      {ticket.subject}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                      {ticket.from_name ?? ticket.from_email}
                    </p>
                  </div>

                  {/* Center: last reply time */}
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {t("awaitingView.lastReply")}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--k-text-secondary)" }}>
                      {relativeTime(ticket.last_response_at)}
                    </span>
                  </div>

                  {/* Action */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openThread(ticket); }}
                    className="k-btn-secondary"
                    style={{ flexShrink: 0, height: 30, fontSize: 12 }}
                  >
                    {t("awaitingView.followUp")}
                    <ArrowRight style={{ width: 12, height: 12 }} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
