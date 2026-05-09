import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
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

export function AwaitingCustomerView({ onViewChange }: AwaitingCustomerViewProps) {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const { addTicket, selectTicket } = useTriageStore();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "awaiting_customer")
        .order("sla_due_at", { ascending: true, nullsFirst: false });

      if (!error && data) setTickets(data as Ticket[]);
      setLoading(false);
    })();
  }, [user]);

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

  const openInTriage = (ticket: Ticket) => {
    addTicket(ticket);
    selectTicket(ticket.id);
    onViewChange("inbox");
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--k-surface)" }}>
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
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  borderRadius: 10,
                  border: "1px solid var(--k-border)",
                  background: "white",
                  padding: "12px 16px",
                  boxShadow: "0 1px 2px rgba(9,9,11,0.04)",
                }}
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
                  onClick={() => openInTriage(ticket)}
                  className="k-btn-secondary"
                  style={{ flexShrink: 0, height: 30, fontSize: 12 }}
                >
                  {t("awaitingView.followUp")}
                  <ArrowRight style={{ width: 12, height: 12 }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
