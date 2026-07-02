// ---------------------------------------------------------------------------
// KAI-168 — Operational SLA by ticket priority (API-side wiring).
//
// The pure calculation (computeOperationalSlaTiming, defaults, types) lives
// in @kairo/types/operational-sla.js so the dashboard can compute the same
// thing client-side — it fetches tickets directly from Supabase and via
// Postgres realtime, bypassing this API's list route entirely, so a field
// attached only here would never reach the browser. This file keeps only
// the server-only helper (attachOperationalSla, used to enrich API
// responses that DO go through this service, e.g. for future consumers and
// the escalation cron).
// ---------------------------------------------------------------------------

import {
  computeOperationalSlaTiming,
  type TicketPriority,
  type PrioritySlaConfig,
  type OperationalSlaTiming,
} from "@kairo/types";

export {
  DEFAULT_PRIORITY_SLA_SECONDS,
  computeOperationalSlaTiming,
  computeTicketOperationalSla,
  buildConfigByPriority,
  isBeforeMinimumResponseWindow,
  type TicketPriority,
  type PrioritySlaConfig,
  type OperationalSlaTiming,
  type OperationalSlaStatus,
} from "@kairo/types";

export interface TicketForOperationalSla {
  id: string;
  priority: string | null;
  received_at: string | null;
  created_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
}

/**
 * Attaches a computed `operational_sla` field to each ticket, or `null` when
 * the ticket has no recognized priority. Closed tickets (resolved_at set) are
 * evaluated as of their resolution time so historical status is stable.
 */
export function attachOperationalSla<T extends TicketForOperationalSla>(
  tickets: T[],
  configByPriority: Record<TicketPriority, PrioritySlaConfig>
): (T & { operational_sla: OperationalSlaTiming | null })[] {
  return tickets.map((ticket) => {
    const priority = ticket.priority as TicketPriority | null;
    if (!priority || !(priority in configByPriority)) {
      return { ...ticket, operational_sla: null };
    }
    const startAt = ticket.received_at ?? ticket.created_at;
    if (!startAt) return { ...ticket, operational_sla: null };

    return {
      ...ticket,
      operational_sla: computeOperationalSlaTiming({
        startAt,
        config: configByPriority[priority],
        now: ticket.resolved_at ?? new Date().toISOString(),
        firstResponseAt: ticket.first_response_at,
      }),
    };
  });
}
