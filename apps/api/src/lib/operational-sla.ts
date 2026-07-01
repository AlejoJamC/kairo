// ---------------------------------------------------------------------------
// KAI-168 — Operational SLA by ticket priority.
//
// Separate domain from the tenant/plan-tier contractual SLA (tenant_sla_rules,
// apps/api/src/lib/sla.ts). This one is keyed by the ticket's own priority
// (P1/P2/P3) and drives the 3-state visual indicator (ok/at_risk/breached),
// automatic escalation, and the minimum-response-time gate on automatic sends.
//
// Runs on calendar time (24/7) — no business-hours pauses. ALL elapsed/
// remaining time math is encapsulated in computeOperationalSlaTiming() below
// so that a future configurable business-hours mode only needs to change
// this one function.
// ---------------------------------------------------------------------------

export type TicketPriority = "P1" | "P2" | "P3";

export interface PrioritySlaConfig {
  maxResponseSeconds: number;
  minResponseSeconds: number;
  riskAlertSeconds: number;
  escalationSeconds: number;
}

export const DEFAULT_PRIORITY_SLA_SECONDS: Record<TicketPriority, PrioritySlaConfig> = {
  P1: { maxResponseSeconds: 3600, minResponseSeconds: 900, riskAlertSeconds: 1800, escalationSeconds: 2700 },
  P2: { maxResponseSeconds: 14400, minResponseSeconds: 1800, riskAlertSeconds: 10800, escalationSeconds: 12600 },
  P3: { maxResponseSeconds: 86400, minResponseSeconds: 3600, riskAlertSeconds: 64800, escalationSeconds: 79200 },
};

export type OperationalSlaStatus = "ok" | "at_risk" | "breached";

export interface OperationalSlaTiming {
  elapsedSeconds: number;
  percentUsed: number;
  status: OperationalSlaStatus;
  remainingSeconds: number;
  overdueSeconds: number;
  dueAt: string;
  riskAt: string;
  escalationAt: string;
  minResponseAt: string;
  minResponseWindowOpen: boolean;
}

export interface ComputeOperationalSlaTimingArgs {
  startAt: string;
  config: PrioritySlaConfig;
  now: string;
  firstResponseAt?: string | null;
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

/**
 * Computes all timing/state derived from a ticket's operational SLA clock.
 * Single source of truth for elapsed/remaining time — pure calendar-time
 * (24/7) math. `now` and `firstResponseAt` are passed in explicitly so the
 * same function works for live tickets (now = current time) and closed/
 * historical tickets (now = resolved_at) without any hidden clock reads.
 */
export function computeOperationalSlaTiming(args: ComputeOperationalSlaTimingArgs): OperationalSlaTiming {
  const { startAt, config, now, firstResponseAt } = args;
  const startMs = new Date(startAt).getTime();
  const nowMs = new Date(now).getTime();

  // Once the agent has responded, the clock is frozen at that moment —
  // whatever state the ticket was in when it got its first response is final.
  const clockMs = firstResponseAt ? Math.min(new Date(firstResponseAt).getTime(), nowMs) : nowMs;

  const elapsedSeconds = Math.max(0, Math.round((clockMs - startMs) / 1000));
  const percentUsed = (elapsedSeconds / config.maxResponseSeconds) * 100;

  let status: OperationalSlaStatus;
  if (percentUsed < 50) status = "ok";
  else if (percentUsed <= 100) status = "at_risk";
  else status = "breached";

  const remainingSeconds = Math.max(0, config.maxResponseSeconds - elapsedSeconds);
  const overdueSeconds = Math.max(0, elapsedSeconds - config.maxResponseSeconds);

  return {
    elapsedSeconds,
    percentUsed,
    status,
    remainingSeconds,
    overdueSeconds,
    dueAt: addSeconds(startAt, config.maxResponseSeconds),
    riskAt: addSeconds(startAt, config.riskAlertSeconds),
    escalationAt: addSeconds(startAt, config.escalationSeconds),
    minResponseAt: addSeconds(startAt, config.minResponseSeconds),
    minResponseWindowOpen: nowMs >= new Date(addSeconds(startAt, config.minResponseSeconds)).getTime(),
  };
}

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

/**
 * Builds a full P1/P2/P3 config map from account rows, filling gaps with
 * the documented defaults.
 */
export function buildConfigByPriority(
  rows: { priority: string; max_response_seconds: number; min_response_seconds: number; risk_alert_seconds: number; escalation_seconds: number }[]
): Record<TicketPriority, PrioritySlaConfig> {
  const byPriority = new Map(rows.map((row) => [row.priority, row]));
  const result = {} as Record<TicketPriority, PrioritySlaConfig>;
  for (const priority of ["P1", "P2", "P3"] as TicketPriority[]) {
    const row = byPriority.get(priority);
    result[priority] = row
      ? {
          maxResponseSeconds: row.max_response_seconds,
          minResponseSeconds: row.min_response_seconds,
          riskAlertSeconds: row.risk_alert_seconds,
          escalationSeconds: row.escalation_seconds,
        }
      : DEFAULT_PRIORITY_SLA_SECONDS[priority];
  }
  return result;
}

/**
 * Guard for automatic sends (e.g. AI-drafted acknowledgements/auto-replies):
 * returns true while the minimum response time has NOT yet elapsed, meaning
 * an automatic send must be withheld to avoid looking like an instant bot
 * reply.
 */
export function isBeforeMinimumResponseWindow(startAt: string, minResponseSeconds: number, now: string): boolean {
  const minResponseAt = addSeconds(startAt, minResponseSeconds);
  return new Date(now).getTime() < new Date(minResponseAt).getTime();
}
