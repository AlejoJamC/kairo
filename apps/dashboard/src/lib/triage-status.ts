import type { TicketStatus } from "@kairo/types";

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
  guided:            "triage",
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
