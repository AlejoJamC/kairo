// Display state of the first-response SLA of a ticket: on time, at risk,
// escalating or overdue, following the thresholds of its priority policy
// (risk alert, automatic escalation, maximum response time).

import type { OperationalSlaTiming } from "@kairo/types";
import type { SlaStatus } from "@kairo/ui";

export interface SlaDisplay {
  status: SlaStatus;
  /** Seconds left until the maximum response time, or overdue seconds. */
  seconds: number;
  /** 0 to 1 of the maximum response time that has elapsed. */
  progress: number;
}

export function slaDisplay(timing: OperationalSlaTiming, nowMs: number = Date.now()): SlaDisplay {
  const due = new Date(timing.dueAt).getTime();
  const status: SlaStatus =
    nowMs >= due ? "overdue"
    : nowMs >= new Date(timing.escalationAt).getTime() ? "escalating"
    : nowMs >= new Date(timing.riskAt).getTime() ? "atRisk"
    : "onTime";
  return {
    status,
    seconds: status === "overdue" ? timing.overdueSeconds : timing.remainingSeconds,
    progress: Math.min(1, timing.percentUsed / 100),
  };
}

/** "Xd Xh Xm": the largest unit down to minutes, dropping leading zero units. */
export function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Compact time: the largest single unit ("2h", "40m", "153d"). */
export function formatCompactDuration(totalSeconds: number): string {
  if (totalSeconds >= 86400) return `${Math.floor(totalSeconds / 86400)}d`;
  if (totalSeconds >= 3600) return `${Math.floor(totalSeconds / 3600)}h`;
  return `${Math.max(0, Math.floor(totalSeconds / 60))}m`;
}
