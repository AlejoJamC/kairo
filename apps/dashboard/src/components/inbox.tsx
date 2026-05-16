import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import { useRealtimeTickets } from "@/hooks/use-realtime-tickets";
import { TicketList } from "./ticket-list";
import { TicketDetail } from "./ticket-detail";
import { AiAssistant } from "./ai-assistant";
import type { Ticket } from "@kairo/types";

export function Inbox() {
  const { user } = useAuth();
  const { tickets, selectedTicketId, setTickets, setScanning } = useTriageStore();

  useRealtimeTickets();

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    (async () => {
      setScanning(true);
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("user_id", user.id)
        .neq("status", "awaiting_customer")
        .order("priority_score", { ascending: false, nullsFirst: false })
        .limit(200);

      if (error) {
        console.error("[inbox] Failed to fetch tickets:", error);
      } else {
        setTickets((data as Ticket[]) ?? []);
      }
      setScanning(false);
    })();
  }, [user]);

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
