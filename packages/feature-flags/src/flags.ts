// =============================================================================
// Feature flags — flip ON/OFF to enable or disable high-level product areas.
//
// Dashboard right panel tabs are now build-time flags (VITE_FF_*) — see .env.example
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
//   enable_operational_sla_escalation — KAI-168: run the operational-SLA-by-priority
//                                  escalation cron, which notifies the assigned agent
//                                  (or a supervisor/admin fallback) via an in-app
//                                  notification once a ticket crosses its priority's
//                                  configured escalation threshold. OFF by default.
//
// Runtime-overrideable numeric flags (server-only, via FEATURE_FLAG_<UPPER_SNAKE> env vars):
//   gmail_poll_cron_interval_minutes — KAI-248: how often (in minutes) the Gmail
//                                  history.list poll cron fans out one event per active
//                                  Gmail integration. Default: 5. Inngest cron syntax only
//                                  supports whole-minute granularity. Set
//                                  FEATURE_FLAG_GMAIL_POLL_CRON_INTERVAL_MINUTES=<n> to
//                                  override. The cron schedule is registered at app
//                                  startup, so a new value takes effect on next deploy/restart.
//   operational_sla_escalation_check_interval_minutes — KAI-168: how often (in minutes)
//                                  the operational-SLA escalation cron scans open tickets
//                                  for priority-based escalation thresholds. Default: 5.
// =============================================================================

// ─── Static dashboard flags (build-time, no env override) ────────────────────

export const FLAGS = {
  dashboard: {
    rightPanel: {
      // All tabs are now build-time flags (VITE_FF_*) in apps/dashboard
      // See .env.example and ai-assistant.tsx for configuration
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
  enable_operational_sla_escalation: false,
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

// ─── Runtime numeric flags with env override support ──────────────────────────

const NUMERIC_FLAG_DEFAULTS = {
  gmail_poll_cron_interval_minutes: 5,
  operational_sla_escalation_check_interval_minutes: 5,
} as const;

type NumericFlagName = keyof typeof NUMERIC_FLAG_DEFAULTS;

function readEnvNumericFlag(envKey: string, defaultValue: number): number {
  if (typeof process === "undefined") return defaultValue;
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue; // invalid → default
  return parsed;
}

/**
 * Returns the value of a runtime-overrideable numeric flag.
 * Env var: FEATURE_FLAG_<UPPER_SNAKE_NAME>  (e.g. FEATURE_FLAG_GMAIL_POLL_CRON_INTERVAL_MINUTES)
 * Server-only — reads process.env at call time. Falls back to the documented
 * default when unset, empty, or not a positive integer.
 */
export function getNumericFlag(name: NumericFlagName): number {
  const envKey = `${ENV_PREFIX}${name.toUpperCase()}`;
  return readEnvNumericFlag(envKey, NUMERIC_FLAG_DEFAULTS[name]);
}
