import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import type { Ticket } from "@kairo/types";

export function useRealtimeTickets() {
  const { user, accountId } = useAuth();
  const { addTicket, updateClassification } = useTriageStore();

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
          const next = payload.new as Ticket;
          const prev = payload.old as Partial<Ticket>;
          // Only fire updateClassification when classified_at is newly set
          if (next.classified_at && !prev.classified_at) {
            updateClassification(next.id, next);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, accountId]);
}
