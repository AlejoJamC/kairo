# Observability stack (KAI-126, Phase 1 — local)

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

2. Start the stack (detached — no dedicated terminal needed, unlike `bun dev` /
   `bun run dev:inngest`):

   ```bash
   bun run dev:observability
   ```

   To stop it: `bun run dev:observability:down`.

3. Wait for health checks, then open:
   - Langfuse UI: http://localhost:3003 — create an account, an org, and a project.
     Under project settings, create an API key pair and add to `.env.local`:
     ```
     LANGFUSE_BASE_URL=http://localhost:3003
     LANGFUSE_PUBLIC_KEY=pk-lf-...
     LANGFUSE_SECRET_KEY=sk-lf-...
     ```
   - HyperDX UI: http://localhost:8080 — first run walks you through creating a
     local user; the "Local ClickHouse" connection and its 4 sources (Logs, Traces,
     Metrics, Sessions) are pre-provisioned via `DEFAULT_CONNECTIONS`/`DEFAULT_SOURCES`
     in the compose file, no manual wiring needed. `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
     already matches the compose file's exposed port, no extra setup needed on
     the app side.

4. Restart `apps/api`'s and `apps/dashboard`'s dev servers (`bun dev`) so the new
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

Extract a *new* runtime-family package (e.g. `@kairo/observability` gains a
`./nextjs` export, or a dedicated one) only when a second app in that same
runtime family needs it — e.g. if `landing`/`kelan` (both Next.js) both need
server-side tracing. Not before; that would be premature abstraction with no
second consumer.

## What's instrumented today

- `classifyEmailWithMeta` (`packages/intelligence/src/classification/classify.ts`) —
  covers all 3 pipeline tiers (`tier1-fast-path`, `tier2-background`, `tier3-deferred`),
  since they all call through this one function.
- `generateEmbedding` / `generateEmbeddings` (`packages/intelligence/src/embeddings/embed.ts`)
  — covers both `ticket-embedding.ts` and `kb-embedding.ts`.
- General `apps/api` HTTP/fetch traffic, via `@opentelemetry/auto-instrumentations-node`
  (Inngest pipeline functions run in the same process, so they're covered too).
- `apps/dashboard` — fetch calls from the browser (the actual product surface
  support agents use), via `@kairo/observability/web` in `src/main.tsx`.

Not yet instrumented (deferred, see KAI-126 for scope):
- Structured per-provider logs/metrics for embeddings (KAI-214, separate ticket).
- `apps/landing` / `apps/kelan` (Next.js server + browser) — different
  instrumentation pattern (`@vercel/otel` server-side), not done yet.
- `apps/mobile` — placeholder app today, nothing to instrument.
- Production deployment (Phase 2 of KAI-126) — this doc covers local only. `apps/api`'s
  `start`/`build:api` scripts don't preload `instrumentation.ts` yet; wire that up when
  prod infra for both products actually exists.

## Resource usage

9 containers total (`clickhouse`, 5 Langfuse services, `clickstack-otel-collector`,
`clickstack-app`, `clickstack-mongo`). More containers than the all-in-one image, but
the heaviest one (ClickHouse) is deduplicated instead of running twice. Budget at
least 2GB of RAM for Docker Desktop — under ~1GB, ClickHouse/MinIO start failing
health checks under memory pressure (observed directly while building this).
