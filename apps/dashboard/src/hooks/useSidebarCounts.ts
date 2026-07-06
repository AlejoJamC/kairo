import { useState, useEffect } from "react";
import { apiCall } from "@/lib/api-client";
import type { TicketStatus } from "@kairo/types";
import type { AppView } from "@/types";

export type SidebarCounts = Partial<Record<TicketStatus, number>>;

// Maps each sidebar AppView to the ticket status bucket returned by the API.
// Views without a status mapping (panel, clients, settings, change-password) show no badge.
export const VIEW_TO_STATUS: Partial<Record<AppView, TicketStatus>> = {
  inbox:           "open",
  awaiting:        "awaiting_customer",
  "auto-resolved": "auto_resolved",
  escalated:       "escalated",
};

export function useSidebarCounts(): SidebarCounts | null {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchCounts = async () => {
      try {
        const resp = await apiCall("/api/v1/sidebar/counts");
        if (!resp.ok || cancelled) return;
        const data = (await resp.json()) as SidebarCounts;
        if (!cancelled) setCounts(data);
      } catch {
        // Non-fatal — stale counts are better than a crash
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 20_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return counts;
}
