# Kairo

AI-powered support cockpit for n8n companies — classifies emails, routes tickets, and learns per-client behavior.

🇨🇴 [Versión en español](docs/README.es.md)

## Stack

| Layer | Tech |
|---|---|
| Monorepo | Turborepo + Bun |
| WebApp | Vite + React 19 |
| API | Bun + Hono + Inngest |
| Landing | Next.js 15 |
| Admin (Kelan) | Next.js 15 |
| Database | Supabase (Postgres + Auth) |
| AI | Claude API (prod) / Ollama (local) |
| Email | Gmail API |
| Deploy | Vercel |
| Language | TypeScript (strict) |

## Structure

```
kairo/
├── apps/
│   ├── api/       # Bun + Hono — backend API + Inngest functions (port 3001)
│   ├── dashboard/ # Vite + React — support dashboard (port 5173)
│   ├── landing/   # Next.js — marketing site (port 3000)
│   ├── kelan/     # Next.js — admin panel (internal, port 3002)
│   └── mobile/    # Expo — mobile app
├── packages/
│   ├── env/            # centralized env validation (@t3-oss/env-core)
│   ├── types/          # shared TypeScript interfaces
│   ├── i18n/           # shared translations (EN/ES)
│   ├── ui/             # shared ShadCN components
│   ├── feature-flags/  # static + runtime feature flags
│   ├── identity/       # email/phone normalization, contact dedup
│   ├── claude_design/  # Pencil design token package
│   └── intelligence/   # modular LLM provider (Ollama / Anthropic)
│       └── prompts/    # versioned LLM prompts, per-language subdirs
├── supabase/
│   └── migrations/     # shared DB migrations (Postgres via Supabase)
└── kairo-internal/
    └── architecture/   # 17 Architecture Decision Records
```

## Getting Started

```bash
bun install
bun run dev
```

- API → http://localhost:3001
- WebApp → http://localhost:5173
- Landing → http://localhost:3000
- Kelan (admin) → http://localhost:3002

## Commands

```bash
bun run build   # build all apps
bun run lint    # lint all packages
bun run clean   # clean build artifacts
bun test        # run tests
```

## Environment Variables

Kairo uses [`@kairo/env`](packages/env/index.ts) — a centralized, type-safe env layer built on [`@t3-oss/env-core`](https://env.t3.gg). Every variable is validated with Zod at startup. Raw `process.env` and `import.meta.env` access is **not allowed** anywhere in the codebase.

### Single root `.env.local`

All variables — shared and app-specific — live in one file at the monorepo root:

```bash
cp .env.example .env.local   # fill in real values, never commit
```

Each app reads from that single file:

| App | How it reads root `.env.local` |
|---|---|
| `apps/api` | `bun run --env-file ../../.env.local` — loaded directly by Bun at startup |
| `apps/dashboard` | Vite `envDir: "../../"` points it at the monorepo root |
| `apps/landing` | `next.config.ts` calls `loadEnvConfig("../../")` before webpack compiles, so `NEXT_PUBLIC_*` vars get inlined into the client bundle |
| `apps/kelan` | `next.config.ts` calls `loadEnvConfig("../../")` — same pattern as landing |

The `.env.example` is grouped into three sections — `SHARED`, `LANDING`, and `WEBAPP` — with comments explaining each variable.

### Where variables are validated

| Package / App | File | Variables it owns |
|---|---|---|
| `packages/env` | `index.ts` | Shared backend variables: Supabase, AI/LLM, pipeline (concurrency, timeouts), Inngest, server-side feature flags |
| `apps/dashboard` | `src/env.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LANDING_URL` |
| `apps/landing` | `env.ts` | All `NEXT_PUBLIC_*` vars + `GOOGLE_CLIENT_SECRET`, `INNGEST_EVENT_KEY` |
| `apps/kelan` | `env.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_KELAN_URL` |

Never access `process.env` or `import.meta.env` directly — always import from the nearest `env.ts`:

```ts
// ✅ correct
import { env } from "@/env";
const url = env.NEXT_PUBLIC_SUPABASE_URL;

// ❌ wrong — no validation, no types
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
```
