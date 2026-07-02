export * from './database.js';
export * from './admin.js';
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

export type TicketStatus =
  | 'open'
  | 'awaiting_customer'
  | 'in_progress'
  | 'resolved'
  | 'auto_resolved'
  | 'guided'
  | 'escalated'
  | 'reopened';
