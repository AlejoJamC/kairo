// ---------------------------------------------------------------------------
// KAI-55 — auto-assignment. Round-robin among active agents, confirmed by
// the user: whoever has gone longest without a new ticket gets the next one.
//
// Kairo has no team/department model (no `teams` table, `assigned_to` is a
// single `auth.users` row, `account_members.role` is a permission level, not
// a department) — RoutingDecision's owner enum (support/engineering/
// security/...) has nothing to point at. What exists, and what this
// implements, is agent-level assignment.
//
// "Least recently assigned wins" is round-robin without a separate rotation
// cursor to persist: an agent's own ticket history already says whose turn
// it is, and it stays correct across an agent joining, leaving, or coming
// back — a positional cursor (index 0, 1, 2, ...) would not. With exactly
// one active agent it always resolves to that one agent, so this subsumes
// what used to be a separate sole-agent rule.
//
// Deliberately per-ticket, not batch: `findOrCreateTicketForThread` creates
// one ticket at a time as mail arrives, so there is no backlog to sort by
// priority at the point this runs. Sorting a batch of several tickets
// P1-before-P3 before assigning them is a different, larger change to the
// pipeline's own loop — not built here; ask before assuming it's wanted.
// ---------------------------------------------------------------------------

export interface AgentWorkload {
  userId: string;
  /** This agent's most recently assigned ticket, or null if they have never had one. */
  lastAssignedAt: string | null;
}

/** `a` is older than `b` — `null` (never assigned) is older than any timestamp. */
function isOlder(a: string | null, b: string | null): boolean {
  if (a === null) return b !== null;
  if (b === null) return false;
  return a < b;
}

/**
 * The agent who should get the next ticket: whoever has gone longest without
 * one. Null when there is no active agent to give it to.
 */
export function resolveRoundRobinAssignee(agents: readonly AgentWorkload[]): string | null {
  if (agents.length === 0) return null;
  let chosen = agents[0]!;
  for (const agent of agents.slice(1)) {
    if (isOlder(agent.lastAssignedAt, chosen.lastAssignedAt)) chosen = agent;
  }
  return chosen.userId;
}
