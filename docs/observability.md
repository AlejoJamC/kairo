# Observability stack (KAI-126)

Two products, self-hosted locally via Docker, sharing **one ClickHouse server**
(separate databases — `langfuse` and `default`) instead of running two:

- **Langfuse** — LLM/AI tracing (email classification, embeddings). Own database
  `langfuse` on the shared server.
- **ClickStack (HyperDX)** — general app observability via OpenTelemetry. Database
  `default` on the same server.

This mirrors the intended end-state: eventually both point at the same ClickHouse
Cloud service instead of a local container. Uses ClickStack's individual-services
compose (`clickstack-otel-collector` + `clickstack-app` + `clickstack-mongo`, app
metadata only), not the `hyperdx-all-in-one` image — that one bundles its own
ClickHouse with no way to point it at an external server.

Both products are optional at runtime: if their env vars are unset, the app starts
and runs normally with tracing disabled (see `packages/env/index.ts`).

## First-time setup

1. Generate secrets and add them to `.env.local` (not committed):

   ```bash
   echo "LANGFUSE_SALT=$(openssl rand -hex 32)" >> .env.local
   echo "LANGFUSE_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.local
   echo "LANGFUSE_NEXTAUTH_SECRET=$(openssl rand -hex 32)" >> .env.local
   ```

2. Langfuse headless-inits an org/project/user/API-key pair on first boot (KAI-189)
   — pick the key pair yourself and add everything to `.env.local` *before*
   first `up`, so the values match on both sides:

   ```bash
   echo "LANGFUSE_INIT_PROJECT_PUBLIC_KEY=pk-lf-$(openssl rand -hex 16)" >> .env.local
   echo "LANGFUSE_INIT_PROJECT_SECRET_KEY=sk-lf-$(openssl rand -hex 16)" >> .env.local
   echo "LANGFUSE_INIT_USER_PASSWORD=$(openssl rand -hex 12)" >> .env.local
   echo "HYPERDX_API_KEY=$(openssl rand -hex 16)" >> .env.local
   ```
   Then copy the `LANGFUSE_INIT_PROJECT_*` values into `LANGFUSE_PUBLIC_KEY`/
   `LANGFUSE_SECRET_KEY` too (same key pair, two purposes: one bootstraps the
   Langfuse container, the other is what `apps/api` reads to send traces).

3. Start the stack (detached — no dedicated terminal needed, unlike `bun dev` /
   `bun run dev:inngest`):

   ```bash
   bun run dev:observability
   ```

   To stop it: `bun run dev:observability:down`.

4. Open:
   - Langfuse UI: http://localhost:3003 — sign in with `LANGFUSE_INIT_USER_EMAIL`
     (default `local@kairo.dev`) / `LANGFUSE_INIT_USER_PASSWORD`. No manual
     org/project/API-key creation — headless init already did it.
   - HyperDX UI: http://localhost:8080 — **does** need a manual first-run
     signup (no headless-init equivalent here) at http://localhost:8080/join.
     The "Local ClickHouse" connection and its 4 sources (Logs, Traces, Metrics,
     Sessions) are pre-provisioned via `DEFAULT_CONNECTIONS`/`DEFAULT_SOURCES`
     in the compose file, no manual wiring needed there.
     `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` already matches the
     compose file's exposed port.

5. **Required — the endpoint var itself.** Every `*OTEL_EXPORTER_OTLP_ENDPOINT`
   var is `optional()` in each app's `env.ts` — unset means telemetry silently
   no-ops (by design, so the app works with zero observability config). That
   also means a missing var doesn't error, it just produces "no traffic",
   easy to mistake for a real bug. Set it explicitly per app:
   ```bash
   echo "OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318" >> .env.local             # apps/api
   echo "VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318" >> .env.local        # apps/dashboard
   echo "NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318" >> .env.local  # apps/landing, apps/kelan
   echo "EXPO_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318" >> .env.local  # apps/mobile
   ```

6. **Required — ingestion auth.** ClickStack's OTel collector rejects every
   export with a silent 401 unless callers send the Ingestion API key as a
   raw `authorization` header (no `Bearer ` prefix — confirmed against a live
   instance). `HYPERDX_API_KEY` in the compose file does **not** set this key
   — HyperDX generates its own in Mongo, independent of that env var. After
   the first HyperDX signup, go to Team Settings → API & Agents → "Ingestion
   API key" → reveal it, then set it on every app that emits traces:
   ```bash
   echo "OTEL_EXPORTER_OTLP_HEADERS=authorization=<ingestion-key>" >> .env.local  # apps/api
   echo "VITE_HYPERDX_INGESTION_API_KEY=<ingestion-key>" >> .env.local            # apps/dashboard
   echo "NEXT_PUBLIC_HYPERDX_INGESTION_API_KEY=<ingestion-key>" >> .env.local     # apps/landing, apps/kelan
   echo "EXPO_PUBLIC_HYPERDX_INGESTION_API_KEY=<ingestion-key>" >> .env.local     # apps/mobile
   ```
   Without this, dashboards look like "no traffic yet" instead of "broken" —
   the OTel SDK swallows exporter errors by default (set `OTEL_LOG_LEVEL=debug`
   to see the real `401 Unauthorized` if traces still don't show up).

7. Restart every app's dev server (`bun dev`) so the new env vars are picked up
   — Vite/Next bake `VITE_*`/`NEXT_PUBLIC_*` vars in at dev-server start, a
   page reload alone is not enough.

## Verifying traces show up

Trigger a real classification (e.g. run the app's Gmail sync/pipeline, or
`bun run eval:pipeline` from repo root) and check:

- Langfuse UI → Traces: a `email-classification` generation with prompt/response,
  model, and token usage.
- HyperDX UI → Search: spans for the `apps/api` HTTP/fetch calls (service name
  `kairo-api`, from `OTEL_SERVICE_NAME`).

## MCP servers (optional, for querying traces from Claude Code)

Both products ship an MCP server; register them once real API keys exist:

```bash
claude mcp add --transport http langfuse http://localhost:3003/api/public/mcp \
  --header "Authorization: Basic $(echo -n "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" | base64)"

claude mcp add --transport http clickstack http://localhost:8080/api/mcp \
  --header "Authorization: Bearer <HyperDX Personal API Access Key, from Team Settings>"
```

## Dashboards (KAI-189, Phase 3)

Both products expose their dashboards as code via REST API — provisioned, not
manually clicked together:

```bash
bun run observability:provision
```

Runs both:
- `scripts/observability/langfuse-dashboards.ts` — reads `LANGFUSE_BASE_URL`/
  `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`. Creates "Kairo — LLM
  Observability": generation count/p95 latency/cost/error-level, all grouped
  by generation name (`email-classification`, `embedding`, `embedding-batch`).
- `scripts/observability/hyperdx-dashboard.ts` — reads `HYPERDX_API_URL`
  (`http://localhost:8000`, the API port — not the UI's `:8080`) and
  `HYPERDX_PERSONAL_API_KEY`. **Not** the `HYPERDX_API_KEY` env var from the
  compose file — that one only authenticates telemetry ingestion. Get the
  Personal API access key from Team Settings → API & Agents, after the manual
  HyperDX signup (step 4 above — HyperDX has no headless-init env vars).
  Creates "Kairo — App Observability": request count + p95 duration + error
  count (`StatusCode:Error`, Lucene). Per-metric filters go directly on the
  `select[]` item as `where` + `whereLanguage` — an `aggCondition` field and a
  top-level `config.where` both looked plausible from the schema but are
  silently accepted and dropped, no validation error. Confirmed against a
  live instance, not guessed.

Neither script is idempotent — re-running creates duplicates. Meant to run
once against a fresh instance.

**Remaining gap**: alerts (both products can alert on dashboard tiles) aren't
provisioned yet — they need a notification channel (Slack/email) configured
first, which local dev doesn't have.

## `packages/observability`

One shared package, three runtime-specific entry points — not a single
universal SDK (impossible: OpenTelemetry itself splits Node vs browser vs
React Native SDKs), and not one package per runtime either (that would
scatter the same config surface across the repo). A single package, split by
subpath export:

- `@kairo/observability/node` — `initNodeTelemetry()`, a thin wrapper around
  `NodeSDK` + `LangfuseSpanProcessor` + `OTLPTraceExporter`. Used by `apps/api`'s
  `src/instrumentation.ts`.
- `@kairo/observability/web` — `initWebTelemetry()`, `WebTracerProvider` +
  `FetchInstrumentation` + `OTLPTraceExporter`. Used by `apps/dashboard`'s
  `src/main.tsx`, before the app renders. No `ZoneContextManager` (it requires
  transpiling to ES2015, which conflicts with this monorepo's ES2022 target) —
  spans are correct per-fetch-call; deeply nested async parent/child linking
  across awaits isn't guaranteed. Revisit if that becomes a real need.
- `@kairo/observability/mobile` — `initMobileTelemetry()`, a bare
  `BasicTracerProvider` + `OTLPTraceExporter`, no auto-instrumentation (Hermes
  doesn't support the DOM/Node APIs the other two entry points patch). Used
  by `apps/mobile`'s `app/_layout.tsx`. Manual spans only — see "What's
  instrumented today" below.

`landing` and `kelan` (both Next.js) needed the same server-side pattern
(`@vercel/otel`), so that's now `apps/{landing,kelan}/instrumentation.ts` —
still using `@kairo/observability/web` for their browser side, same as
dashboard. `packages/observability` didn't need a new export for this: Next.js
server-side tracing is `@vercel/otel` itself (a thin wrapper apps call
directly), not something `@kairo/observability` needs to own.

## What's instrumented today

**Every app in the monorepo, including `apps/mobile`:**

| App | Instrumentation | Verified with real data in ClickHouse? |
|---|---|---|
| `packages/intelligence` (Langfuse) | `startObservation` spans in classify.ts/embed.ts | Yes — Langfuse dashboard shows real generations |
| `apps/api` | `@hono/otel` middleware | Yes — `GET /api/v1/health` (200) and `GET /api/v1/sidebar/counts` (401) both landed with correct `http.route`/status |
| `apps/landing` | `@vercel/otel` (server) + `@kairo/observability/web` (browser) | Yes — server spans + a real browser `fetch('/')` span, `url.full` matched |
| `apps/kelan` | same as `landing` | Yes — 500+ spans from a real authenticated session (server + browser) |
| `apps/dashboard` | `@kairo/observability/web` in `main.tsx` | Yes — real browser session (ticket detail view, Supabase REST calls) landed 58 spans with correct `url.full`/status |
| `apps/mobile` | `@kairo/observability/mobile`, manual spans only | No — app still can't boot (no `app.json`/dev script, pre-existing gap) |

`apps/api` note: `@opentelemetry/auto-instrumentations-node` (bundled in
`@kairo/observability/node`) patches Node's `http`/`undici` modules — Bun's
native server and `fetch` never go through either, so it silently created
**zero** spans regardless of the ingestion-auth fix. Fixed by adding
`@hono/otel`'s `httpInstrumentationMiddleware` in `src/index.ts`, which
instruments at the Hono middleware level instead — works on any runtime
(Bun, Node, edge). `initNodeTelemetry()` is still required alongside it: it's
what registers the tracer provider/exporter the middleware attaches spans to,
and it's still how Langfuse's `LangfuseSpanProcessor` gets registered.

`apps/dashboard` note: not a code bug — a missing env var. Its browser-side
`initWebTelemetry()` call is a no-op whenever `VITE_OTEL_EXPORTER_OTLP_ENDPOINT`
is unset (it's `optional()` by design in `env.ts`), and a local `.env.local`
had `VITE_HYPERDX_INGESTION_API_KEY` set but not this one — no error, just
silent "no traffic". Fixed by adding the missing var and restarting the Vite
dev server (see step 5 above).

`apps/landing`/`apps/kelan` note: the browser side is
`@kairo/observability/web` rendered as `<InstrumentationClient />` in
`app/layout.tsx` — **must be rendered, not just imported**: a side-effect-only
`import './_instrumentation-client'` from the Server Component layout isn't
guaranteed to survive Next.js's client bundling, and was silently dropped
until it became an actually-rendered component (returns `null`).

`apps/mobile` note: `@kairo/observability/mobile` (`app/_layout.tsx`), a bare
`BasicTracerProvider` + `OTLPTraceExporter`, no auto-instrumentation. Real RN
OTel distros (Splunk's, Honeycomb's) add auto-instrumentation via a **native
module** that requires an **EAS development build** (breaks Expo Go) — this
is the manual-spans-only alternative that doesn't need either:
`trace.getTracer('kairo-mobile')` is ready to call from anywhere the moment
the app has a real event worth tracing. It doesn't have one yet —
`apps/mobile/app/index.tsx` is still a single static screen — so
`initMobileTelemetry()` runs at startup but nothing calls `startSpan()`
anywhere yet. The OTLP exporter's fetch-based transport is expected to bundle
under Metro (the same package works under Vite in `web.ts`) but that's
untested. If Metro can't resolve it, swap the exporter in
`packages/observability/src/mobile.ts` for a plain `fetch()` POST of OTLP
JSON — nothing else in the file would need to change.

Deferred, unrelated to the instrumentation work itself:
- Structured per-provider logs/metrics for embeddings (KAI-214, separate ticket).
- Production deployment (Phase 2 of KAI-126) — this doc covers local only. `apps/api`'s
  `start`/`build:api` scripts don't preload `instrumentation.ts` yet; wire that up when
  prod infra for both products actually exists.

## Resource usage

9 containers total (`clickhouse`, 5 Langfuse services, `clickstack-otel-collector`,
`clickstack-app`, `clickstack-mongo`). More containers than the all-in-one image, but
the heaviest one (ClickHouse) is deduplicated instead of running twice. Budget at
least 2GB of RAM for Docker Desktop — under ~1GB, ClickHouse/MinIO start failing
health checks under memory pressure (observed directly while building this).
