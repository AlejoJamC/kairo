export * from './database.js';
export * from './admin.js';

import type { Tables } from './database.js';

// KAI-168 — operational SLA by ticket priority (computed field attached by
// the API, not a DB column). Separate domain from tickets.sla_due_at /
// tickets.sla_breached (tenant/plan-tier contractual SLA).
export interface OperationalSlaTiming {
  elapsedSeconds:        number;
  percentUsed:           number;
  status:                'ok' | 'at_risk' | 'breached';
  remainingSeconds:      number;
  overdueSeconds:        number;
  dueAt:                 string;
  riskAt:                string;
  escalationAt:          string;
  minResponseAt:         string;
  minResponseWindowOpen: boolean;
}

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
