import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// SLA badge (reuses ticketCard i18n keys, consistent with ticket-card.tsx)
// ---------------------------------------------------------------------------

function SlaBadge({ slaDate, breached }: { slaDate: string | null | undefined; breached: boolean }) {
  const { t } = useTranslation("dashboard");

  if (breached) {
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700">
        {t("ticketCard.slaBreached")}
      </span>
    );
  }
  if (!slaDate) return null;

  const diff = new Date(slaDate).getTime() - Date.now();
  if (diff <= 0) {
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700">
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
    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-zinc-100 text-zinc-600">
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
    <div className="flex flex-1 flex-col overflow-hidden bg-zinc-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">
          {t("awaitingView.title")}
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {t("awaitingView.subtitle")}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Clock className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        )}

        {!loading && tickets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-zinc-500 text-sm">{t("awaitingView.empty")}</p>
          </div>
        )}

        {!loading && tickets.length > 0 && (
          <ul className="space-y-2">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="group flex items-center gap-4 rounded-lg border bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Left: number + subject + client */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-medium text-zinc-400">
                      {t("awaitingView.ticketNumber", { number: ticket.ticket_number })}
                    </span>
                    {(ticket.sla_breached || ticket.sla_due_at) && (
                      <SlaBadge slaDate={ticket.sla_due_at} breached={ticket.sla_breached ?? false} />
                    )}
                    {ticket.sla_breached && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-zinc-800">
                    {ticket.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {ticket.from_name ?? ticket.from_email}
                  </p>
                </div>

                {/* Center: last reply time */}
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-zinc-400">
                  <span className="text-[10px] uppercase tracking-wide">
                    {t("awaitingView.lastReply")}
                  </span>
                  <span className="font-medium text-zinc-600">
                    {relativeTime(ticket.last_response_at)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => openInTriage(ticket)}
                    className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    {t("awaitingView.followUp")}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
