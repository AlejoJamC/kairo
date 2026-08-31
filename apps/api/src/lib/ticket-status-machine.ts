// KAI-191 — the status vocabulary itself lives in @kairo/types now
// (TicketStatus, TICKET_STATUSES); this file only owns the transition rules
// and the helpers built on top of them.
import { TICKET_STATUSES, type TicketStatus } from '@kairo/types';

export type { TicketStatus };

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open:               ['awaiting_customer', 'in_progress', 'resolved', 'escalated', 'ai_resolved'],
  awaiting_customer:  ['open', 'resolved', 'escalated'],
  in_progress:        ['open', 'awaiting_customer', 'resolved', 'escalated'],
  resolved:           ['open', 'reopened', 'closed'],
  escalated:          ['resolved', 'open', 'reopened'],
  ai_resolved:        ['open', 'reopened', 'closed'],
  reopened:           ['in_progress', 'resolved', 'escalated', 'awaiting_customer'],
  // KAI-191 — the model's only terminal state. No source elsewhere writes
  // 'closed' yet (that's KAI-182); this only defines the rule: once a
  // ticket is closed, it has no outgoing transitions at all.
  closed:             [],
};

export function isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function getTransitionError(from: TicketStatus, to: TicketStatus): string {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  return `Invalid transition from '${from}' to '${to}'. Allowed: [${allowed.join(', ')}]`;
}

export function isTicketStatus(value: string): value is TicketStatus {
  return TICKET_STATUSES.includes(value as TicketStatus);
}
