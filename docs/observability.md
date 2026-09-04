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

5. Restart `apps/api`'s and `apps/dashboard`'s dev servers (`bun dev`) so the new
   env vars are picked up.

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
  Creates "Kairo — App Observability": request count + p95 duration.

Neither script is idempotent — re-running creates duplicates. Meant to run
once against a fresh instance.

**Known gap**: an error-rate tile (filtering HyperDX traces by `StatusCode`)
isn't in the HyperDX dashboard — neither `select[].where` nor
`select[].aggCondition` persisted through the v2 API in testing (silently
dropped, no validation error). The v2 tile-filter field is undocumented;
revisit once confirmed. Alerts (both products can alert on dashboard tiles)
are also not provisioned yet — they need a notification channel (Slack/email)
configured first, which local dev doesn't have.

## `packages/observability`

One shared package, two runtime-specific entry points — not a single universal
SDK (impossible: OpenTelemetry itself splits Node vs browser SDKs), and not one
package per runtime either (that would scatter the same config surface across
the repo). A single package, split by subpath export:

- `@kairo/observability/node` — `initNodeTelemetry()`, a thin wrapper around
  `NodeSDK` + `LangfuseSpanProcessor` + `OTLPTraceExporter`. Used by `apps/api`'s
  `src/instrumentation.ts`.
- `@kairo/observability/web` — `initWebTelemetry()`, `WebTracerProvider` +
  `FetchInstrumentation` + `OTLPTraceExporter`. Used by `apps/dashboard`'s
  `src/main.tsx`, before the app renders. No `ZoneContextManager` (it requires
  transpiling to ES2015, which conflicts with this monorepo's ES2022 target) —
  spans are correct per-fetch-call; deeply nested async parent/child linking
  across awaits isn't guaranteed. Revisit if that becomes a real need.

`landing` and `kelan` (both Next.js) needed the same server-side pattern
(`@vercel/otel`), so that's now `apps/{landing,kelan}/instrumentation.ts` —
still using `@kairo/observability/web` for their browser side, same as
dashboard. `packages/observability` didn't need a new export for this: Next.js
server-side tracing is `@vercel/otel` itself (a thin wrapper apps call
directly), not something `@kairo/observability` needs to own.

## What's instrumented today

**Every app in the monorepo, including `apps/mobile`:**

- `classifyEmailWithMeta` (`packages/intelligence/src/classification/classify.ts`) —
  covers all 3 pipeline tiers (`tier1-fast-path`, `tier2-background`, `tier3-deferred`),
  since they all call through this one function.
- `generateEmbedding` / `generateEmbeddings` (`packages/intelligence/src/embeddings/embed.ts`)
  — covers both `ticket-embedding.ts` and `kb-embedding.ts`.
- `apps/api` — general HTTP/fetch traffic via `@opentelemetry/auto-instrumentations-node`
  (Inngest pipeline functions run in the same process, so they're covered too).
- `apps/dashboard` — fetch calls from the browser, via `@kairo/observability/web`
  in `src/main.tsx`.
- `apps/landing` — server-side via `@vercel/otel` (`instrumentation.ts`), browser
  fetch via `@kairo/observability/web` (`app/_instrumentation-client.tsx`,
  imported from `app/layout.tsx`).
- `apps/kelan` — same two-sided pattern as `landing`.
- `apps/mobile` — `@kairo/observability/mobile` (`app/_layout.tsx`), a bare
  `BasicTracerProvider` + `OTLPTraceExporter`, no auto-instrumentation. Real
  RN OTel distros (Splunk's, Honeycomb's) add auto-instrumentation via a
  **native module** that requires an **EAS development build** (breaks Expo
  Go) — this is the manual-spans-only alternative that doesn't need either:
  `trace.getTracer('kairo-mobile')` is ready to call from anywhere the moment
  the app has a real event worth tracing. It doesn't have one yet —
  `apps/mobile/app/index.tsx` is still a single static screen — so
  `initMobileTelemetry()` runs at startup but nothing calls `startSpan()`
  anywhere yet.
  **Unverified**: `apps/mobile` has no `app.json`/dev script to actually boot
  it (pre-existing gap, unrelated to this) — the OTLP exporter's fetch-based
  transport is expected to bundle under Metro (the same package works under
  Vite in `web.ts`) but that's untested. If Metro can't resolve it, swap the
  exporter in `packages/observability/src/mobile.ts` for a plain `fetch()`
  POST of OTLP JSON — nothing else in the file would need to change.

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
