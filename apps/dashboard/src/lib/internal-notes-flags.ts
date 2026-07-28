import { isFlagEnabled } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// KAI-232 / ADR-025 §8 — visual kill-switch for the ENTIRE internal-notes
// surface: the note mode in the reply bar, the amber note cards in the thread,
// the right-panel Notes tab, the @mention dropdown, and the "@menciones" tab
// in the notification bell.
//
// OFF (default) means no internal-notes UI renders anywhere — including the
// parts KAI-221 shipped unflagged. The backend stays fully on: hiding the UI
// is the agreed kill-switch, there is no server-side gating.
//
// Lives here, not in feature-flags.ts, which stays generic by project rule.
// ---------------------------------------------------------------------------

export const INTERNAL_NOTES_ENABLED = isFlagEnabled(
  import.meta.env.VITE_FF_ENABLE_INTERNAL_NOTES
);
