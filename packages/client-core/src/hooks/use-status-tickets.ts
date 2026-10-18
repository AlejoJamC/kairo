import { useEffect, useState } from "react";
import type { Ticket } from "@kairo/types";
import { createClient } from "../supabase";
import { useAuth } from "../auth";

type TicketDateColumn = "resolved_at" | "sla_due_at" | "updated_at";

export interface StatusTicketsOptions {
  /** Prefix of the realtime channel name; combined with the account id. */
  channelPrefix: string;
  /** Ticket statuses that belong to this list. */
  statuses: readonly string[];
  /** Column the list is ordered by. */
  orderBy: TicketDateColumn;
  ascending: boolean;
}

/**
 * Tickets of one status bucket for the signed-in account: initial query plus a
 * realtime subscription that adds, updates and removes rows as their status
 * enters or leaves the bucket. Rows with an empty order column sort last.
 */
export function useStatusTickets({ channelPrefix, statuses, orderBy, ascending }: StatusTicketsOptions) {
  const { user, accountId } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      const supabase = createClient();
      let query = supabase.from("tickets").select("*").in("status", [...statuses]);
      if (accountId) query = query.eq("account_id", accountId);
      const { data, error } = await query.order(orderBy, { ascending, nullsFirst: false });

      if (!error && data) setTickets(data as Ticket[]);
      setLoading(false);
    })();
  }, [user, accountId, statuses, orderBy, ascending]);

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();
    const channelName = `${channelPrefix}:tickets:${accountId ?? user.id}`;
    const rowFilter = accountId ? `account_id=eq.${accountId}` : undefined;
    const inBucket = (status: string | null | undefined) => !!status && statuses.includes(status);
    const sortKey = (ticket: Ticket) => {
      const value = ticket[orderBy];
      return value ? new Date(value).getTime() : ascending ? Infinity : -Infinity;
    };

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

          if (payload.eventType === "DELETE" || (row && !inBucket(row.status))) {
            const removedId = row?.id ?? oldRow?.id;
            if (removedId) setTickets((prev) => prev.filter((t) => t.id !== removedId));
            return;
          }

          if (row && inBucket(row.status)) {
            setTickets((prev) => {
              const next = prev.some((t) => t.id === row.id)
                ? prev.map((t) => (t.id === row.id ? { ...t, ...row } : t))
                : [...prev, row];
              return next.sort((a, b) => (ascending ? sortKey(a) - sortKey(b) : sortKey(b) - sortKey(a)));
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, accountId, channelPrefix, statuses, orderBy, ascending]);

  return { tickets, setTickets, loading };
}
