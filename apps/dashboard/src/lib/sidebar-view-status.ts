import {
  TRIAGE_COUNTED_STATUSES,
  AWAITING_STATUSES,
  SIDEBAR_RESOLVED_STATUSES,
  ESCALATED_STATUSES,
} from "@kairo/client-core/triage-status";
import type { TicketStatus } from "@kairo/types";
import type { AppView } from "@/types";

// Maps each sidebar AppView to the ticket status bucket(s) returned by the API.
// Views without a status mapping (in-progress, clients, settings, change-password) show no badge.
// Every bucket here is derived from lib/triage-status's STATUS_BUCKET (an
// exhaustive Record<TicketStatus, ...>), so a new TicketStatus member breaks
// the build until it's classified there instead of silently going uncounted.
// "resolved" sums both terminal statuses shown in the Resuelto view (resolved
// + ai_resolved) — see SIDEBAR_RESOLVED_STATUSES for why 'closed' is excluded.
export const VIEW_TO_STATUS: Partial<Record<AppView, TicketStatus[]>> = {
  triage:      TRIAGE_COUNTED_STATUSES,
  awaiting:    AWAITING_STATUSES,
  resolved:    SIDEBAR_RESOLVED_STATUSES,
  escalated:   ESCALATED_STATUSES,
};
