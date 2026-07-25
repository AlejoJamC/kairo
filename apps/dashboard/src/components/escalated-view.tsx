import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { TicketCard } from "@/components/ticket-card";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";

// Own bucket in triage-status.ts (STATUS_BUCKET), counted by the Escalado
// badge and not by Triage — mirrors ResolvedView's setup one status down.
const ESCALATED_STATUSES = ["escalated"] as const;

interface EscalatedViewProps {
  onViewChange: (view: AppView) => void;
}

export function EscalatedView({ onViewChange: _onViewChange }: EscalatedViewProps) {
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
        .in("status", ESCALATED_STATUSES);
      if (accountId) query = query.eq("account_id", accountId);
      const { data, error } = await query
        .order("updated_at", { ascending: false, nullsFirst: false });

      if (!error && data) setTickets(data as Ticket[]);
      setLoading(false);
    })();
  }, [user, accountId]);

  // ---------------------------------------------------------------------------
  // Realtime — mirrors ResolvedView: keep this list in sync so a ticket
  // de-escalated elsewhere disappears from here (and closes its detail pane,
  // since showDetailPane derives from this local list).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    const supabase = createClient();
    const channelName = accountId
      ? `escalated:tickets:${accountId}`
      : `escalated:tickets:${user.id}`;
    const rowFilter = accountId ? `account_id=eq.${accountId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          ...(rowFilter ? { filter: rowFilter } : {}),
        },
        (payload) => {
          const row = payload.new as Ticket | undefined;
          const oldRow = payload.old as Partial<Ticket> | undefined;
          const isEscalated = (status: string | null | undefined) =>
            ESCALATED_STATUSES.includes(status as (typeof ESCALATED_STATUSES)[number]);

          if (payload.eventType === "DELETE" || (row && !isEscalated(row.status))) {
            const removedId = row?.id ?? oldRow?.id;
            if (removedId) setTickets((prev) => prev.filter((t) => t.id !== removedId));
            return;
          }

          if (row && isEscalated(row.status)) {
            setTickets((prev) => {
              const next = prev.some((t) => t.id === row.id)
                ? prev.map((t) => (t.id === row.id ? { ...t, ...row } : t))
                : [...prev, row];
              return next.sort((a, b) => {
                const da = a.updated_at ? new Date(a.updated_at).getTime() : -Infinity;
                const db = b.updated_at ? new Date(b.updated_at).getTime() : -Infinity;
                return db - da;
              });
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, accountId]);

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
