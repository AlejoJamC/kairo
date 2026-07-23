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

// Terminal statuses shown in this view — both are already rendered read-only
// by TicketDetail (KAI-25), so no per-ticket prop plumbing is needed here.
const RESOLVED_STATUSES = ["resolved", "auto_resolved"] as const;

interface ResolvedViewProps {
  onViewChange: (view: AppView) => void;
}

export function ResolvedView({ onViewChange: _onViewChange }: ResolvedViewProps) {
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
        .in("status", RESOLVED_STATUSES);
      if (accountId) query = query.eq("account_id", accountId);
      const { data, error } = await query
        .order("resolved_at", { ascending: false, nullsFirst: false });

      if (!error && data) setTickets(data as Ticket[]);
      setLoading(false);
    })();
  }, [user, accountId]);

  // ---------------------------------------------------------------------------
  // Realtime — mirrors AwaitingCustomerView: keep this list in sync so a ticket
  // reopened elsewhere disappears from here (and closes its detail pane, since
  // showDetailPane derives from this local list).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    const supabase = createClient();
    const channelName = accountId
      ? `resolved:tickets:${accountId}`
      : `resolved:tickets:${user.id}`;
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
          const isResolved = (status: string | null | undefined) =>
            RESOLVED_STATUSES.includes(status as (typeof RESOLVED_STATUSES)[number]);

          if (payload.eventType === "DELETE" || (row && !isResolved(row.status))) {
            const removedId = row?.id ?? oldRow?.id;
            if (removedId) setTickets((prev) => prev.filter((t) => t.id !== removedId));
            return;
          }

          if (row && isResolved(row.status)) {
            setTickets((prev) => {
              const next = prev.some((t) => t.id === row.id)
                ? prev.map((t) => (t.id === row.id ? { ...t, ...row } : t))
                : [...prev, row];
              return next.sort((a, b) => {
                const da = a.resolved_at ? new Date(a.resolved_at).getTime() : -Infinity;
                const db = b.resolved_at ? new Date(b.resolved_at).getTime() : -Infinity;
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
   * it will render read-only automatically since the ticket's status is
   * resolved/auto_resolved.
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
          {t("resolvedView.title")}
        </h1>
        <p style={{ marginTop: 2, fontSize: 13, color: "var(--k-text-tertiary)" }}>
          {t("resolvedView.subtitle")}
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
            <p style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>{t("resolvedView.empty")}</p>
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
