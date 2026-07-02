import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import { useRealtimeTickets } from "@/hooks/use-realtime-tickets";
import { apiCall } from "@/lib/api-client";
import { TicketList } from "./ticket-list";
import { TicketDetail } from "./ticket-detail";
import { AiAssistant } from "./ai-assistant";
import type { Ticket, TicketPriority, PrioritySlaConfig } from "@kairo/types";

export function Inbox() {
  const { user, accountId } = useAuth();
  const { tickets, selectedTicketId, setTickets, setScanning, setOperationalSlaConfig } = useTriageStore();

  useRealtimeTickets();

  // KAI-168 — fetch the account's operational SLA config once per session.
  // Tickets themselves are fetched directly from Supabase below (not via the
  // API), so this is the only round-trip needed to compute operational_sla
  // client-side for every ticket, regardless of where its row came from.
  useEffect(() => {
    if (!user) return;
    apiCall("/api/v1/tenants/operational-sla-config")
      .then((res) => res.json())
      .then((body: { config: (PrioritySlaConfig & { priority: TicketPriority })[] }) => {
        const byPriority = {} as Record<TicketPriority, PrioritySlaConfig>;
        for (const row of body.config) {
          const { priority, ...config } = row;
          byPriority[priority] = config;
        }
        setOperationalSlaConfig(byPriority);
      })
      .catch(() => {}); // keep defaults on failure
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    (async () => {
      setScanning(true);

      // ADR-022: tickets are scoped by account_id. When accountId is known, filter
      // explicitly; otherwise RLS (current_account_id()) still scopes the query.
      let query = supabase
        .from("tickets")
        .select("*")
        .not("status", "in", "(awaiting_customer,resolved,auto_resolved)")
        .order("priority_score", { ascending: false, nullsFirst: false })
        .limit(200);

      if (accountId) {
        query = query.eq("account_id", accountId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[inbox] Failed to fetch tickets:", error.message, error);
        setTickets([]);
      } else {
        setTickets((data as Ticket[]) ?? []);
      }
      setScanning(false);
    })();
  }, [user, accountId]);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  return (
    <>
      <div className="flex w-[360px] flex-col border-r bg-white" style={{ flexShrink: 0, borderRight: "1px solid var(--k-border)" }}>
        <TicketList />
      </div>
      <TicketDetail />
      <AiAssistant
        customer={selectedTicket?.from_name ?? selectedTicket?.from_email ?? "—"}
      />
    </>
  );
}
