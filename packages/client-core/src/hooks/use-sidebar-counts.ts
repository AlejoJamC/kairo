import { useState, useEffect } from "react";
import { getSidebarCounts } from "../endpoints";
import { createClient } from "../supabase";
import { useAuth } from "../auth";
import type { TicketStatus } from "@kairo/types";

export type SidebarCounts = Partial<Record<TicketStatus, number>>;

/** A burst of ticket changes (a whole inbox arriving) is read once, after this pause. */
const REFRESH_AFTER_CHANGE_MS = 500;

/** The change of a ticket that moves a nav badge: a new ticket, a deleted one, or one that changed status. */
export function changesSidebarCounts(payload: { eventType?: string; old?: { status?: string | null }; new?: { status?: string | null } }): boolean {
  if (payload.eventType !== "UPDATE") return true;
  // Without the previous row (a table that does not send it) any update may have moved the ticket.
  if (payload.old?.status === undefined) return true;
  return payload.old.status !== payload.new?.status;
}

/**
 * Keeps the nav badge counts current. They are read every `pollIntervalSeconds`, and again right
 * after a ticket of the account arrives or changes status, so a batch arriving does not wait for
 * the next poll. Null until the first answer.
 */
export function useSidebarCounts(pollIntervalSeconds: number, enabled = true): SidebarCounts | null {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  const { user, accountId } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const fetchCounts = async () => {
      try {
        const resp = await getSidebarCounts();
        if (!resp.ok || cancelled) return;
        const data = (await resp.json()) as SidebarCounts;
        if (!cancelled) setCounts(data);
      } catch {
        // Non-fatal — stale counts are better than a crash
      }
    };

    const refreshSoon = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void fetchCounts();
      }, REFRESH_AFTER_CHANGE_MS);
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, pollIntervalSeconds * 1000);

    const supabase = userId ? createClient() : null;
    const channel = supabase
      ?.channel(`sidebar-counts:${accountId ?? userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", ...(accountId ? { filter: `account_id=eq.${accountId}` } : {}) },
        (payload) => {
          if (changesSidebarCounts(payload)) refreshSoon();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (pending) clearTimeout(pending);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [pollIntervalSeconds, enabled, userId, accountId]);

  return counts;
}
