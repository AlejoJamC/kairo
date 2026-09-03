# Observability stack (KAI-126, Phase 1 — local)

Two independent systems, both self-hosted locally via Docker:

- **Langfuse** — LLM/AI tracing (email classification, embeddings).
- **ClickStack (HyperDX)** — general app observability via OpenTelemetry.

Both are optional at runtime: if their env vars are unset, the app starts and runs
normally with tracing disabled (see `packages/env/index.ts`).

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
   - Langfuse UI: http://localhost:3002 — create an account, an org, and a project.
     Under project settings, create an API key pair and add to `.env.local`:
     ```
     LANGFUSE_BASE_URL=http://localhost:3002
     LANGFUSE_PUBLIC_KEY=pk-lf-...
     LANGFUSE_SECRET_KEY=sk-lf-...
     ```
   - HyperDX UI: http://localhost:8080 — first run walks you through creating a
     local user and a data source. `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
     already matches the compose file's exposed port, no extra setup needed on
     the app side.

4. Restart `apps/api`'s dev server (`bun run dev`, root or `apps/api/`) so the new
   env vars are picked up by `src/instrumentation.ts` (preloaded before `src/index.ts`,
   see `apps/api/package.json`).

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
claude mcp add --transport http langfuse http://localhost:3002/api/public/mcp \
  --header "Authorization: Basic $(echo -n "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" | base64)"

claude mcp add --transport http clickstack http://localhost:8080/api/mcp \
  --header "Authorization: Bearer <HyperDX Personal API Access Key, from Team Settings>"
```

## What's instrumented today

- `classifyEmailWithMeta` (`packages/intelligence/src/classification/classify.ts`) —
  covers all 3 pipeline tiers (`tier1-fast-path`, `tier2-background`, `tier3-deferred`),
  since they all call through this one function.
- `generateEmbedding` / `generateEmbeddings` (`packages/intelligence/src/embeddings/embed.ts`)
  — covers both `ticket-embedding.ts` and `kb-embedding.ts`.
- General `apps/api` HTTP/fetch traffic, via `@opentelemetry/auto-instrumentations-node`
  (Inngest pipeline functions run in the same process, so they're covered too).

Not yet instrumented (deferred, see KAI-126 for scope):
- Structured per-provider logs/metrics for embeddings (KAI-214, separate ticket).
- Dashboard (browser-side) tracing — a different SDK (OTel Web), not requested yet.
- Production deployment (Phase 2 of KAI-126) — this doc covers local only. `apps/api`'s
  `start`/`build:api` scripts don't preload `instrumentation.ts` yet; wire that up when
  prod infra for both products actually exists.

## Known limitation

The ClickStack `hyperdx-all-in-one` container has no volume configured in
`docker-compose.observability.yml`, so its data does not survive `docker compose down`.
Fine for Phase 1 (recollection POC); revisit if local trace history needs to persist.
