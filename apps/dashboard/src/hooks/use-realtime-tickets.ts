import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import type { Ticket } from "@kairo/types";

export function useRealtimeTickets() {
  const { user, accountId } = useAuth();
  const { addTicket, upsertTicket } = useTriageStore();

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    const channelName = accountId ? `triage:tickets:${accountId}` : `triage:tickets:${user.id}`;
    const rowFilter = accountId ? `account_id=eq.${accountId}` : undefined;

    const channel = supabase.channel(channelName).on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tickets",
          ...(rowFilter ? { filter: rowFilter } : {}),
        },
        (payload) => {
          addTicket(payload.new as Ticket);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          ...(rowFilter ? { filter: rowFilter } : {}),
        },
        (payload) => {
          // Merge any field change (classification, status, etc.) and re-insert
          // the ticket if it re-entered the active triage queue (e.g. a customer
          // reply moves it awaiting_customer -> open). The render-time filter in
          // ticket-list.tsx (isTriageActive) hides it again if it left the queue.
          upsertTicket(payload.new as Ticket);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, accountId]);
}
