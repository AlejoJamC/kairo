import { isFlagEnabled } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// Side surfaces of the dashboard. Each one is OFF unless its variable is
// exactly "true". Hiding is UI-only; the backend stays live.
//
// Lives here, not in feature-flags.ts, which stays generic by project rule.
// ---------------------------------------------------------------------------

/** The Work Queue panel on the left: the list of tickets to work through. */
export const WORK_QUEUE_ENABLED = isFlagEnabled(
  import.meta.env.VITE_FF_ENABLE_WORK_QUEUE
);

/** The Superpowers panel on the right of the triage views, with all its tabs. */
export const SUPERPOWERS_ENABLED = isFlagEnabled(
  import.meta.env.VITE_FF_ENABLE_SUPERPOWERS
);

/** The Notes tab of the Superpowers panel. Also requires the internal-notes flag. */
export const NOTES_TAB_ENABLED = isFlagEnabled(
  import.meta.env.VITE_FF_ENABLE_NOTES_TAB
);

/** The drawer listing earlier tickets related to the selected one. */
export const RELATED_HISTORY_DRAWER_ENABLED = isFlagEnabled(
  import.meta.env.VITE_FF_ENABLE_RELATED_HISTORY_DRAWER
);

/** The slide-out with a contact's detail in the client directory. */
export const CONTACT_DETAIL_DRAWER_ENABLED = isFlagEnabled(
  import.meta.env.VITE_FF_ENABLE_CONTACT_DETAIL_DRAWER
);
