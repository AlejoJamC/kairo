import { TICKET_STATUSES, type TicketStatus } from "@kairo/types";

// ---------------------------------------------------------------------------
// Single source of truth for how a ticket status maps to the dashboard's
// queues. Before this existed, the triage list declared its own blacklist
// ("everything except awaiting/resolved/auto_resolved") while the aside badge
// declared its own whitelist (["open"]). The two drifted silently: a ticket in
// in_progress showed up in the list but was counted by no badge at all, so the
// list read 8/8 while the aside read 7.
//
// Declaring the mapping as a Record over TicketStatus makes it exhaustive by
// construction — adding a status to the union breaks the build here until it
// is classified, instead of quietly falling through as uncounted.
// ---------------------------------------------------------------------------

type StatusBucket =
  // Worked from the triage list, and counted by the Triage badge.
  | "triage"
  // Has its own view (Escalado) and its own badge; out of the triage queue,
  // same as "awaiting" below.
  | "escalated"
  // Has its own view and its own badge; out of the triage queue.
  | "awaiting"
  // Final states — live under "Resuelto", never in triage.
  | "final";

const STATUS_BUCKET: Record<TicketStatus, StatusBucket> = {
  open:              "triage",
  // in_progress is reachable from a quick action — closer to an acknowledge
  // than to a separate stage — so it stays in the triage queue rather than
  // disappearing into a view of its own.
  in_progress:       "triage",
  reopened:          "triage",
  escalated:         "escalated",
  awaiting_customer: "awaiting",
  resolved:          "final",
  auto_resolved:     "final",
};

// Statuses that leave the active triage queue. A status outside TicketStatus
// (raw string straight from the DB) is treated as still active, same as the
// blacklist this replaced — the list errs toward showing a ticket, never
// toward hiding it.
export function isTriageActive(status: string | null | undefined): boolean {
  const bucket = STATUS_BUCKET[status as TicketStatus] as StatusBucket | undefined;
  return bucket !== "awaiting" && bucket !== "final" && bucket !== "escalated";
}

// Statuses the Triage badge counts. Excludes 'escalated' on purpose: it is a
// separate case with its own aside entry, and counting it here would make one
// ticket sum into two badges.
export const TRIAGE_COUNTED_STATUSES: TicketStatus[] = (
  Object.entries(STATUS_BUCKET) as [TicketStatus, StatusBucket][]
)
  .filter(([, bucket]) => bucket === "triage")
  .map(([status]) => status);

// Statuses shown in the Escalado view and counted by its badge. Derived from
// the same STATUS_BUCKET map above so it can't drift from it.
export const ESCALATED_STATUSES: TicketStatus[] = (
  Object.entries(STATUS_BUCKET) as [TicketStatus, StatusBucket][]
)
  .filter(([, bucket]) => bucket === "escalated")
  .map(([status]) => status);

// ---------------------------------------------------------------------------
// KAI-191 — statuses excluded from the Inbox/TicketList initial fetch, i.e.
// the values inside `.not("status", "in", "(...)")` in inbox.tsx and
// ticket-list.tsx.
//
// KNOWN DISCREPANCY, preserved on purpose: this is NOT the same set as
// "not triage-active" above. STATUS_BUCKET (and isTriageActive) treats
// 'escalated' as leaving the triage queue, but this query has never
// excluded 'escalated' — today it comes back from Supabase along with the
// triage-active tickets. Fixing that mismatch is a behaviour change and is
// out of scope for this refactor (KAI-191 only consolidates the vocabulary
// declaration); this constant exists to reproduce today's three-value list
// exactly, not to reconcile it with STATUS_BUCKET.
const IS_EXCLUDED_FROM_INBOX_FETCH: Record<TicketStatus, boolean> = {
  open: false,
  in_progress: false,
  reopened: false,
  escalated: false,
  awaiting_customer: true,
  resolved: true,
  auto_resolved: true,
};

export const INBOX_FETCH_EXCLUDED_STATUSES: TicketStatus[] = TICKET_STATUSES.filter(
  (status) => IS_EXCLUDED_FROM_INBOX_FETCH[status]
);

// Ready-to-use PostgREST `.not("status", "in", ...)` filter value built from
// the constant above, e.g. "(awaiting_customer,resolved,auto_resolved)".
export const INBOX_FETCH_EXCLUDED_STATUSES_FILTER = `(${INBOX_FETCH_EXCLUDED_STATUSES.join(",")})`;
