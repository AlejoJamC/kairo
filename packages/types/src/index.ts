export * from './database.js';
export * from './admin.js';

import type { Tables } from './database.js';
export type Ticket                = Tables<'tickets'>;
export type TenantPriorityConfig  = Tables<'tenant_priority_config'>;
export type TenantSlaRule         = Tables<'tenant_sla_rules'>;
export type AccountMember         = Tables<'account_members'>;

export type TicketStatus =
  | 'open'
  | 'awaiting_customer'
  | 'in_progress'
  | 'resolved'
  | 'auto_resolved'
  | 'guided'
  | 'escalated';
