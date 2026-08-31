import { useState, useEffect } from "react";
import { apiCall } from "@/lib/api-client";
import { getNumericFlag } from "@/lib/feature-flags";
import { TRIAGE_COUNTED_STATUSES } from "@/lib/triage-status";
import type { TicketStatus } from "@kairo/types";
import type { AppView } from "@/types";

export type SidebarCounts = Partial<Record<TicketStatus, number>>;

// KAI-177 — poll interval for the nav badge counts, in seconds. Default: 20
// (unchanged from the previous hardcoded value). Override at build time with
// VITE_FF_SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS.
const SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS = getNumericFlag(
  import.meta.env.VITE_FF_SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS,
  20
);

// Maps each sidebar AppView to the ticket status bucket(s) returned by the API.
// Views without a status mapping (in-progress, clients, settings, change-password) show no badge.
// "resolved" sums both terminal statuses shown in the Resuelto view (resolved + auto_resolved).
// "triage" comes from lib/triage-status so the badge counts exactly what the
// triage list shows — it used to be a hardcoded ["open"], which silently left
// in_progress/reopened tickets uncounted.
export const VIEW_TO_STATUS: Partial<Record<AppView, TicketStatus[]>> = {
  triage:      TRIAGE_COUNTED_STATUSES,
  awaiting:    ["awaiting_customer"],
  resolved:    ["resolved", "auto_resolved"],
  escalated:   ["escalated"],
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
    const interval = setInterval(fetchCounts, SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return counts;
}
