// =============================================================================
// Feature flags — flip ON/OFF to enable or disable high-level product areas.
//
// Hierarchy:
//   dashboard
//     └── rightPanel
//           ├── clientTab       (Pestaña 1 — Cliente)
//           ├── similarTab      (Pestaña 2 — Similares)
//           ├── articlesTab     (Pestaña 3 — Artículos)
//           └── escalateTab     (Pestaña 4 — Escalar)  ← OFF: not ready yet
//
// Runtime-overrideable flags (server-only, via FEATURE_FLAG_<UPPER_SNAKE> env vars):
//   enable_detection_ui          — KAI-201: show real-time detection step in onboarding wizard
//   enable_contact_extraction    — KAI-225: emit `tickets/ticket.created` to trigger the
//                                  contact-extraction worker (creates draft_contact rows from
//                                  classified tickets). OFF by default — the classifier
//                                  pipeline is intentionally decoupled and the worker is opt-in.
//   enable_ticket_acknowledgement — KAI-246: send `acknowledgement.html` (via outbox) to the
//                                  customer when a new ticket is created from an inbound
//                                  email (tier1-fast-path / incremental-sync, was_created=true).
//                                  OFF by default. When ON and the send succeeds, the
//                                  out-of-hours auto-reply (KAI-40) is skipped for that
//                                  creation to avoid double auto-replies.
// =============================================================================

// ─── Static dashboard flags (build-time, no env override) ────────────────────

export const FLAGS = {
  dashboard: {
    rightPanel: {
      clientTab:   true,
      similarTab:  true,
      articlesTab: true,
      escalateTab: false, // 🚧 not ready for testing — re-enable when escalation flow is refined
    },
  },
} as const;

export type FeatureFlags = typeof FLAGS;

// ─── Runtime flags with env override support ─────────────────────────────────

const ENV_PREFIX = "FEATURE_FLAG_";

const FLAG_DEFAULTS = {
  enable_detection_ui: false,
  enable_contact_extraction: false,
  enable_ticket_acknowledgement: false,
} as const;

type RuntimeFlagName = keyof typeof FLAG_DEFAULTS;

function readEnvFlag(envKey: string, defaultValue: boolean): boolean {
  if (typeof process === "undefined") return defaultValue;
  const val = process.env[envKey];
  if (val === "true") return true;
  if (val === "false") return false;
  return defaultValue; // undefined, empty, or invalid → default
}

/**
 * Returns the value of a runtime-overrideable flag.
 * Env var: FEATURE_FLAG_<UPPER_SNAKE_NAME>  (e.g. FEATURE_FLAG_ENABLE_DETECTION_UI)
 * Server-only — reads process.env at call time.
 */
export function getFlag(name: RuntimeFlagName): boolean {
  const envKey = `${ENV_PREFIX}${name.toUpperCase()}`;
  return readEnvFlag(envKey, FLAG_DEFAULTS[name]);
}
