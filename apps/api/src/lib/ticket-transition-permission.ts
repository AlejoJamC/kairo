// KAI-191 — single gate for "may this request perform this ticket status
// transition", combining the two separate questions ticket-status-machine.ts
// answers:
//
//   isValidTransition()         — is this transition legal in the machine
//   isTransitionAllowedForRole() — may THIS caller's role drive it via the API
//
// These are deliberately different questions with deliberately different
// HTTP outcomes: an illegal transition is 422 INVALID_TRANSITION, a legal
// transition this role can't perform is 403 TRANSITION_NOT_ALLOWED_FOR_ROLE.
// Every route that drives a transition (PATCH /:id/status, POST /:id/escalate,
// the transitions inside POST /:id/reply) calls this one function instead of
// re-deriving the two checks inline, so the two response shapes can never
// drift apart between endpoints.
//
// Kept in its own file (rather than inline in routes/v1/tickets.ts) so it
// can be unit-tested without pulling in tickets.ts's env-dependent import
// graph (supabase client, Inngest, intelligence providers, ...) — see
// ticket-transition-permission.test.ts.
import {
  isValidTransition,
  getTransitionError,
  isTransitionAllowedForRole,
  type TicketStatus,
  type DashboardRole,
} from "./ticket-status-machine.js";

export type TransitionPermissionResult =
  | { ok: true }
  | { ok: false; httpStatus: 422; body: { error: string; code: "INVALID_TRANSITION" } }
  | { ok: false; httpStatus: 403; body: { error: string; code: "TRANSITION_NOT_ALLOWED_FOR_ROLE" } };

export function checkTransitionPermission(
  from: TicketStatus,
  to: TicketStatus,
  role: DashboardRole | null
): TransitionPermissionResult {
  if (!isValidTransition(from, to)) {
    return {
      ok: false,
      httpStatus: 422,
      body: { error: getTransitionError(from, to), code: "INVALID_TRANSITION" },
    };
  }

  if (!role || !isTransitionAllowedForRole(from, to, role)) {
    return {
      ok: false,
      httpStatus: 403,
      body: {
        error: `Role '${role ?? "none"}' is not permitted to transition a ticket from '${from}' to '${to}'.`,
        code: "TRANSITION_NOT_ALLOWED_FOR_ROLE",
      },
    };
  }

  return { ok: true };
}
