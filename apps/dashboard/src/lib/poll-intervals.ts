import { getNumericFlag } from "@/lib/feature-flags";

// Poll intervals, in seconds, for the background counters. Override at build
// time with the matching VITE_FF_* variable.

/** Nav badge counts (KAI-177). */
export const SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS = getNumericFlag(
  import.meta.env.VITE_FF_SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS,
  20
);

/** Internal-note counters per ticket. */
export const NOTE_COUNTS_POLL_INTERVAL_SECONDS = getNumericFlag(
  import.meta.env.VITE_FF_NOTE_COUNTS_POLL_INTERVAL_SECONDS,
  30
);
