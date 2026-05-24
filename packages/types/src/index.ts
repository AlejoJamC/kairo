export * from './database.js';
export * from './admin.js';

import type { Tables } from './database.js';
export type Ticket                = Tables<'tickets'>;
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
  | 'escalated';
