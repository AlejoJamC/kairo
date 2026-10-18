import { useState, useEffect } from "react";
import { getSidebarCounts } from "../endpoints";
import type { TicketStatus } from "@kairo/types";

export type SidebarCounts = Partial<Record<TicketStatus, number>>;

/** Polls the nav badge counts every `pollIntervalSeconds`; null until the first answer. */
export function useSidebarCounts(pollIntervalSeconds: number): SidebarCounts | null {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);

  useEffect(() => {
    let cancelled = false;

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

    fetchCounts();
    const interval = setInterval(fetchCounts, pollIntervalSeconds * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollIntervalSeconds]);

  return counts;
}
