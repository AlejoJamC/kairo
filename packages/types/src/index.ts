export * from './database.js';
export * from './admin.js';
export * from './classification.js';
export * from './operational-sla.js';

import type { Tables } from './database.js';
import type { OperationalSlaTiming } from './operational-sla.js';

// KAI-168 — operational SLA by ticket priority. Not a DB column — computed
// on demand (client or server) from priority/received_at/first_response_at.
// Separate domain from tickets.sla_due_at/tickets.sla_breached (tenant/plan-
// tier contractual SLA).
export type Ticket = Tables<'tickets'> & { operational_sla?: OperationalSlaTiming | null };
export type TenantPriorityConfig  = Tables<'tenant_priority_config'>;
export type TenantSlaRule         = Tables<'tenant_sla_rules'>;
export type AccountMember         = Tables<'account_members'>;
export type DraftContact          = Tables<'draft_contact'>;
export type WorkerRun             = Tables<'worker_runs'>;
export type DraftContactAuditLog  = Tables<'draft_contact_audit_log'>;

// KAI-191 — single source of truth for the ticket status vocabulary. Every
// other list of statuses (the runtime array below, the API status machine,
// the dashboard's triage/resolved/escalated buckets, the PATCH /status zod
// enum, PostgREST filter strings, …) must derive from this union instead of
// re-listing its members, so adding a state only requires editing here plus
// classifying it wherever TypeScript then reports a compile error.
export type TicketStatus =
  | 'open'
  | 'awaiting_customer'
  | 'in_progress'
  | 'resolved'
  | 'ai_resolved'
  | 'escalated'
  | 'reopened'
  | 'closed';

// Exhaustive over TicketStatus by construction: TypeScript rejects this
// object literal if a member is missing (or if one that no longer exists in
// the union is left behind), so TICKET_STATUSES can never drift from the
// type above.
const TICKET_STATUS_MEMBERSHIP: Record<TicketStatus, true> = {
  open: true,
  awaiting_customer: true,
  in_progress: true,
  resolved: true,
  ai_resolved: true,
  escalated: true,
  reopened: true,
  closed: true,
};

export const TICKET_STATUSES: TicketStatus[] = Object.keys(
  TICKET_STATUS_MEMBERSHIP
) as TicketStatus[];

// Final states — a ticket that has reached one of these will not be worked
// again from the active queues. Shared by the API (related-history lookback)
// and the dashboard (Resuelto view), so it lives here rather than being
// hand-copied in both packages. Exhaustive over TicketStatus for the same
// reason as TICKET_STATUS_MEMBERSHIP above.
const IS_RESOLVED_STATUS: Record<TicketStatus, boolean> = {
  open: false,
  awaiting_customer: false,
  in_progress: false,
  resolved: true,
  ai_resolved: true,
  escalated: false,
  reopened: false,
  closed: true,
};

export const RESOLVED_STATUSES: TicketStatus[] = TICKET_STATUSES.filter(
  (status) => IS_RESOLVED_STATUS[status]
);
