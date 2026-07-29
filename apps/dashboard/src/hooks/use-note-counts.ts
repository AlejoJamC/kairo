import { useEffect } from "react";
import { apiCall } from "@/lib/api-client";
import { getNumericFlag } from "@/lib/feature-flags";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { useTriageStore, type NoteCounts } from "@/stores/triage-store";

// ---------------------------------------------------------------------------
// KAI-232 — keeps the per-ticket internal-note counters in the triage store.
//
// Feeds three surfaces at once: the amber "🔒 n" chip in the queue, the note
// counter in the ticket header, and the Notes tab badge. Polled like the
// sidebar counts (ADR-010 Tier 2) so a teammate's new note shows up without a
// reload. Does nothing when the internal-notes UI is off — nothing would
// render the numbers anyway.
// ---------------------------------------------------------------------------

const NOTE_COUNTS_POLL_INTERVAL_SECONDS = getNumericFlag(
  import.meta.env.VITE_FF_NOTE_COUNTS_POLL_INTERVAL_SECONDS,
  30
);

export function useNoteCounts(enabled: boolean) {
  const setNoteCounts = useTriageStore((s) => s.setNoteCounts);

  useEffect(() => {
    if (!INTERNAL_NOTES_ENABLED || !enabled) return;

    let cancelled = false;

    function load() {
      apiCall("/api/v1/notes/counts")
        .then((res) => (res.ok ? res.json() : { data: {} }))
        .then((body: { data?: Record<string, NoteCounts> }) => {
          if (!cancelled) setNoteCounts(body.data ?? {});
        })
        .catch(() => {});
    }

    load();
    const timer = setInterval(load, NOTE_COUNTS_POLL_INTERVAL_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, setNoteCounts]);
}
