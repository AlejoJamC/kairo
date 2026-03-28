# Kairo

AI-powered support cockpit for n8n companies — classifies emails, routes tickets, and learns per-client behavior.

🇨🇴 [Versión en español](docs/README.es.md)

## Stack

| Layer | Tech |
|---|---|
| Monorepo | Turborepo + Bun |
| WebApp | Vite + React 19 |
| Landing | Next.js 15 |
| API | Bun + Hono |
| Database | Supabase (Postgres + Auth) |
| AI | Claude API (prod) / Ollama (local) |
| Email | Gmail API |
| Deploy | Vercel |
| Language | TypeScript (strict) |

## Structure

```
kairo/
├── apps/
│   ├── webapp/    # Vite + React — support dashboard
│   ├── landing/   # Next.js — marketing site
│   ├── api/       # Bun + Hono — backend
│   └── mobile/    # Expo — mobile app
├── packages/
│   ├── env/            # centralized env validation (@t3-oss/env-core)
│   ├── types/          # shared TypeScript interfaces
│   ├── i18n/           # shared translations (EN/ES)
│   ├── ui/             # shared ShadCN components
│   └── intelligence/   # modular LLM provider (Ollama / Anthropic)
├── supabase/
│   └── migrations/     # shared DB migrations (Postgres via Supabase)
└── specs/         # feature specs (pending/done)
```

## Getting Started

```bash
bun install
bun run dev
```

- WebApp → http://localhost:5173
- Landing → http://localhost:3000
- API → http://localhost:3001

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
| `apps/api` | Bun reads `.env.local` from the monorepo root natively |
| `apps/webapp` | Vite `envDir: "../../"` points it at the monorepo root |
| `apps/landing` | `next.config.ts` calls `loadEnvConfig("../../")` before webpack compiles, so `NEXT_PUBLIC_*` vars get inlined into the client bundle |

The `.env.example` is grouped into three sections — `SHARED`, `LANDING`, and `WEBAPP` — with comments explaining each variable.

**Migrating from an older setup?** If you had `apps/landing/.env.local` or `apps/webapp/.env.local`, merge their contents into the root `.env.local` and rename `GOOGLE_CLIENT_SECRET` → `GOOGLE_CLIENT_SECRET`.

### Where variables are validated

| Package / App | File | Variables it owns |
|---|---|---|
| `packages/env` | `index.ts` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTELLIGENCE_PROVIDER`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_SECRET` |
| `apps/api` | `src/env.ts` | Re-exports `@kairo/env` + `PORT` |
| `apps/webapp` | `src/env.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LANDING_URL` |
| `apps/landing` | `env.ts` | All `NEXT_PUBLIC_*` vars + `GOOGLE_CLIENT_SECRET` |

Never access `process.env` or `import.meta.env` directly — always import from the nearest `env.ts`:

```ts
// ✅ correct
import { env } from "@/env";
const url = env.NEXT_PUBLIC_SUPABASE_URL;

// ❌ wrong — no validation, no types
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
```
