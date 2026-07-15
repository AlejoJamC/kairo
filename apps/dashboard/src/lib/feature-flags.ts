// ---------------------------------------------------------------------------
// Client-side feature flags (build-time, VITE_FF_*).
// A flag is ON only when its env var is exactly the string "true".
// Absent/undefined/anything else → OFF. Never throws when unset.
// Same convention as the right-panel tab flags in ai-assistant.tsx.
// ---------------------------------------------------------------------------

export function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

// KAI-24 — ticket grouping in the triage left panel: multi-select checkboxes,
// "Agrupar seleccionados" action bar, AI similarity suggestion callout and the
// grouped-tickets badge on cards. Backend endpoints stay live; this only
// controls whether the UI surfaces the feature.
export const TICKET_GROUPING_ENABLED = isFlagEnabled(
  import.meta.env.VITE_FF_ENABLE_TICKET_GROUPING
);
