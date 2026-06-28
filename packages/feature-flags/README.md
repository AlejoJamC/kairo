# @kairo/feature-flags

Centralized feature flag definitions for the Kairo monorepo. All flags live in `src/flags.ts` — never define ad-hoc booleans elsewhere.

## Three kinds of flags

### 1. Static flags (`FLAGS`)

Build-time constants. No environment override. Used for product areas whose visibility is a deliberate, code-level decision (a panel exists or it doesn't).

```ts
import { FLAGS } from "@kairo/feature-flags";

if (FLAGS.dashboard.rightPanel.assistantTab) {
  // render the tab
}
```

### 2. Runtime flags (`getFlag`) — Server-side

Server-only booleans backed by `process.env`. Used for opt-in behavior that needs to be toggled per environment (dev, staging, prod) without a redeploy. The function reads `process.env` at call time, so changing the env var and restarting the process is enough.

```ts
import { getFlag } from "@kairo/feature-flags";

if (getFlag("enable_contact_extraction")) {
  // emit event
}
```

Env var naming: `FEATURE_FLAG_<UPPER_SNAKE_OF_FLAG_NAME>`.

### 3. Build-time flags (Framework-specific) — Client-side

For client-side code (e.g., Vite SPA) that can't access `process.env` at runtime. Compiled into the bundle during the build. Use framework-specific prefixes:
- **Vite**: `VITE_FF_<UPPER_SNAKE_OF_FLAG_NAME>`

```ts
// In a Vite component
const isFeatureEnabled = import.meta.env.VITE_FF_ENABLE_ESCALATE_TAB === "true";
```

These flags follow the same semantic naming as `FEATURE_FLAG_*` but are suffixed with the framework prefix.

Valid values: `"true"` and `"false"`. Anything else (empty, missing, typo) falls back to the default declared in `FLAG_DEFAULTS`.

## Static flags catalog

| Path | Default | Description |
|---|---|---|
| `dashboard.rightPanel.clientTab` | `true` | Tab 1 of the ticket right panel — Client. |
| `dashboard.rightPanel.similarTab` | `true` | Tab 2 — Similar tickets (semantic search). |
| `dashboard.rightPanel.articlesTab` | `true` | Tab 3 — Knowledge base articles. |

**Note:** `escalateTab` (KAI-249) is a **build-time flag** in `apps/dashboard` — controlled by `VITE_FF_ENABLE_ESCALATE_TAB` (defaults to `false`). See `.env.example`.

## Runtime flags catalog

| Flag name | Env var | Default | Owner ticket | Purpose |
|---|---|---|---|---|
| `enable_detection_ui` | `FEATURE_FLAG_ENABLE_DETECTION_UI` | `false` | KAI-201 | Shows the real-time email detection step inside the onboarding wizard. When off, the wizard skips straight to completion. |
| `enable_contact_extraction` | `FEATURE_FLAG_ENABLE_CONTACT_EXTRACTION` | `false` | KAI-225 | Emits the `tickets/ticket.created` Inngest event from both `tier1-fast-path.ts` and `apps/landing/app/bff/gmail/sync/route.ts`. When off, the classifier pipeline is completely unaware of the contact-extraction worker — zero side effects, no `worker_runs` rows, no `draft_contact` writes. Designed so the classifier promise (ADR-017's 60s SLO) is never put at risk by an opt-in subscriber. |
| `enable_ticket_acknowledgement` | `FEATURE_FLAG_ENABLE_TICKET_ACKNOWLEDGEMENT` | `false` | KAI-246 | Sends `acknowledgement.html` (via outbox) to the customer when a new ticket is created from an inbound email (`was_created=true` in tier1-fast-path / incremental-sync). Guards: flag OFF, message outside 15-min freshness window, no `gmailThreadId`, or no parseable recipient email. When the ack is sent successfully, the out-of-hours auto-reply (KAI-40) is skipped for that creation to avoid double auto-replies. |

## Adding a new runtime flag

1. Add the entry to `FLAG_DEFAULTS` in `src/flags.ts` with the default value the codebase should assume when the env var is unset. Default to `false` unless there is a strong reason otherwise — safe-by-default is the rule.
2. Document the flag in the JSDoc-style block at the top of `src/flags.ts`.
3. Add a row to the "Runtime flags catalog" table in this README.
4. Add tests in `__tests__/flags.test.ts` mirroring the existing pattern (unset → default, `"true"` → true, `"false"` → false, invalid → default).
5. Reference the flag by name in code via `getFlag("your_flag_name")`. The type system enforces that only declared names are accepted.

## Adding a new static flag

1. Add the entry to the `FLAGS` object in `src/flags.ts`.
2. Add a row to the "Static flags catalog" table in this README.
3. No env var, no test scaffolding — these are compile-time constants. To disable a static flag, edit `src/flags.ts` directly.

## Design notes

- **No remote feature flag service.** Static flags ship with the build; runtime flags read `process.env`. This is intentional — Kairo's deployment model does not justify the operational cost of a remote provider yet. The shape of `getFlag` makes it trivial to swap in a remote backend later without touching call sites.
- **Server-only.** `getFlag` reads `process.env` so it is only meaningful on the server. Do not import this package from a client component and expect runtime overrides to work — the bundle would either inline the build-time defaults or fail to access `process.env`.
- **One source of truth.** Every flag lives here. If you find a `process.env.SOME_FEATURE` check scattered in a route file or a worker, migrate it into a runtime flag declared in this package.
