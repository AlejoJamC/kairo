export type TicketStatus =
  | 'open'
  | 'awaiting_customer'
  | 'in_progress'
  | 'resolved'
  | 'auto_resolved'
  | 'guided'
  | 'escalated';

export const TICKET_STATUSES: TicketStatus[] = [
  'open',
  'awaiting_customer',
  'in_progress',
  'resolved',
  'auto_resolved',
  'guided',
  'escalated',
];

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open:               ['awaiting_customer', 'in_progress', 'resolved', 'escalated', 'guided', 'auto_resolved'],
  awaiting_customer:  ['open', 'resolved', 'escalated'],
  in_progress:        ['open', 'awaiting_customer', 'resolved', 'escalated'],
  resolved:           ['open'],
  escalated:          ['resolved', 'open'],
  guided:             ['resolved'],
  auto_resolved:      ['open'],
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
