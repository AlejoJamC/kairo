import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import { useRealtimeTickets } from "@/hooks/use-realtime-tickets";
import { TicketList } from "./ticket-list";
import { TicketDetail } from "./ticket-detail";
import { AiAssistant } from "./ai-assistant";
import { SyncButton } from "./sync-button";
import type { Ticket } from "@kairo/types";

export function Inbox() {
  const { user } = useAuth();
  const { tickets, selectedTicketId, setTickets, setScanning } = useTriageStore();

  // Subscribe to realtime ticket events
  useRealtimeTickets();

  // Initial fetch
  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    (async () => {
      setScanning(true);
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("user_id", user.id)
        .order("received_at", { ascending: false })
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
      <div className="flex h-screen w-[300px] flex-col border-r bg-white">
        <SyncButton onSyncComplete={() => {
          // Realtime handles new tickets; just re-fetch to catch any we missed
          if (!user) return;
          const supabase = createClient();
          supabase
            .from("tickets")
            .select("*")
            .eq("user_id", user.id)
            .order("received_at", { ascending: false })
            .limit(200)
            .then(({ data }) => {
              if (data) setTickets(data as Ticket[]);
            });
        }} />
        <TicketList />
      </div>
      <TicketDetail />
      <AiAssistant
        customer={selectedTicket?.from_name ?? selectedTicket?.from_email ?? "—"}
      />
    </>
  );
}
