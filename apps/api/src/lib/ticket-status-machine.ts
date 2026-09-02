// KAI-191 — the status vocabulary itself lives in @kairo/types now
// (TicketStatus, TICKET_STATUSES); this file only owns the transition rules
// and the helpers built on top of them.
//
// KAI-191 — permission is declared on the same edge as the transition
// itself. Each edge carries not just its destination but the list of
// DashboardRoles allowed to drive it through the API, so "is this legal"
// and "may this caller do it" are answered from one structure instead of
// being scattered across route handlers.
import { TICKET_STATUSES, type TicketStatus } from '@kairo/types';
import type { DashboardRole } from '../middleware/rbac-check.js';

export type { TicketStatus, DashboardRole };

export interface TransitionEdge {
  to: TicketStatus;
  /**
   * Roles allowed to drive this edge through the API. An empty list means
   * no human role may perform it from an endpoint — it stays legal in the
   * machine (isValidTransition still returns true) for non-HTTP callers
   * that act as the system, e.g. actorType: "system".
   */
  roles: DashboardRole[];
}

// KAI-191 — the matrix, as decided today: owner/admin/supervisor/agent may
// all perform every *operational* transition. There is no transition today
// that a lower role should be denied — the only restricted edges are the
// two into 'closed', which no role reaches through the API (see below).
//
// This is deliberately permissive and provisional. The whole point of
// declaring permission on the edge is that tightening it later is a
// one-line change to a `roles` array plus a test, not a hunt through route
// handlers.
const ALL_ROLES: DashboardRole[] = ['owner', 'admin', 'supervisor', 'agent'];

// KAI-191 correction (2026-09-02) — `open` is an entry-only state: a ticket
// is 'open' exactly once, the moment it's created/synced. Nothing else ever
// returns a ticket to 'open' — once a human (or the system) has touched it,
// the return path is 'in_progress' (from awaiting_customer) or 'reopened'
// (from the resolved family / escalated). The five `-> open` edges this
// table used to carry (awaiting_customer, in_progress, resolved, ai_resolved,
// escalated) were wrong and are removed; see
// apps/api/src/lib/ticket-thread-transitions.ts for the one live call site
// that depended on the wrong awaiting_customer -> open edge.
export const ALLOWED_TRANSITIONS: Record<TicketStatus, TransitionEdge[]> = {
  open: [
    { to: 'awaiting_customer', roles: ALL_ROLES },
    { to: 'in_progress',       roles: ALL_ROLES },
    { to: 'resolved',          roles: ALL_ROLES },
    { to: 'escalated',         roles: ALL_ROLES },
    { to: 'ai_resolved',       roles: ALL_ROLES },
  ],
  awaiting_customer: [
    // KAI-191 correction — was 'open'. A ticket waiting on the customer is
    // already owned (a human took it, or it auto-moved here after a reply);
    // a customer reply resumes work, it doesn't drop the ticket back to an
    // unowned queue.
    { to: 'in_progress', roles: ALL_ROLES },
    { to: 'resolved',    roles: ALL_ROLES },
    { to: 'escalated',   roles: ALL_ROLES },
  ],
  in_progress: [
    { to: 'awaiting_customer', roles: ALL_ROLES },
    { to: 'resolved',          roles: ALL_ROLES },
    { to: 'escalated',         roles: ALL_ROLES },
  ],
  resolved: [
    { to: 'reopened', roles: ALL_ROLES },
    // KAI-191 — no human role reaches 'closed' through the API. The edge
    // stays legal in the machine because the closure domain (KAI-182) calls
    // transitionTicketStatus() directly as a system actor, without going
    // through an HTTP route.
    { to: 'closed',   roles: [] },
  ],
  escalated: [
    { to: 'resolved',          roles: ALL_ROLES },
    { to: 'in_progress',       roles: ALL_ROLES },
    { to: 'awaiting_customer', roles: ALL_ROLES },
    { to: 'reopened',          roles: ALL_ROLES },
  ],
  ai_resolved: [
    { to: 'reopened', roles: ALL_ROLES },
    // KAI-191 — same as resolved -> closed above.
    { to: 'closed',   roles: [] },
  ],
  reopened: [
    { to: 'in_progress',       roles: ALL_ROLES },
    { to: 'resolved',          roles: ALL_ROLES },
    { to: 'escalated',         roles: ALL_ROLES },
    { to: 'awaiting_customer', roles: ALL_ROLES },
  ],
  // KAI-191 — the model's only terminal state. No source elsewhere writes
  // 'closed' yet (that's KAI-182); this only defines the rule: once a
  // ticket is closed, it has no outgoing transitions at all.
  closed: [],
};

export function isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return (ALLOWED_TRANSITIONS[from] ?? []).some((edge) => edge.to === to);
}

export function getTransitionError(from: TicketStatus, to: TicketStatus): string {
  const allowed = (ALLOWED_TRANSITIONS[from] ?? []).map((edge) => edge.to);
  return `Invalid transition from '${from}' to '${to}'. Allowed: [${allowed.join(', ')}]`;
}

/**
 * Whether `role` may drive the from -> to transition through the API.
 * False for an illegal transition (no matching edge) as well as for a
 * legal one whose edge excludes this role.
 */
export function isTransitionAllowedForRole(
  from: TicketStatus,
  to: TicketStatus,
  role: DashboardRole
): boolean {
  const edge = (ALLOWED_TRANSITIONS[from] ?? []).find((e) => e.to === to);
  if (!edge) return false;
  return edge.roles.includes(role);
}

/**
 * Which transitions `role` may perform from `from`. This is what the
 * lifecycle endpoint needs to build the UI's set of legal next actions
 * without guessing at (or duplicating) the permission matrix.
 */
export function getAllowedTransitionsForRole(from: TicketStatus, role: DashboardRole): TicketStatus[] {
  return (ALLOWED_TRANSITIONS[from] ?? [])
    .filter((edge) => edge.roles.includes(role))
    .map((edge) => edge.to);
}

export function isTicketStatus(value: string): value is TicketStatus {
  return TICKET_STATUSES.includes(value as TicketStatus);
}
