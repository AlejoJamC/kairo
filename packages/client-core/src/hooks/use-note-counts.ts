import { useEffect } from "react";
import { getNoteCounts } from "../endpoints";
import { useTriageStore, type NoteCounts } from "../stores/triage-store";

// ---------------------------------------------------------------------------
// KAI-232 — keeps the per-ticket internal-note counters in the triage store.
//
// Feeds three surfaces at once: the amber "🔒 n" chip in the queue, the note
// counter in the ticket header, and the Notes tab badge. Polled like the
// sidebar counts (ADR-010 Tier 2) so a teammate's new note shows up without a
// reload. The caller decides when it is enabled (the internal-notes UI off
// means nothing would render the numbers) and how often to poll.
// ---------------------------------------------------------------------------

export function useNoteCounts(enabled: boolean, pollIntervalSeconds: number) {
  const setNoteCounts = useTriageStore((s) => s.setNoteCounts);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    function load() {
      getNoteCounts()
        .then((res) => (res.ok ? res.json() : { data: {} }))
        .then((body: { data?: Record<string, NoteCounts> }) => {
          if (!cancelled) setNoteCounts(body.data ?? {});
        })
        .catch(() => {});
    }

    load();
    const timer = setInterval(load, pollIntervalSeconds * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, pollIntervalSeconds, setNoteCounts]);
}
