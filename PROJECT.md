# Kairo — AI Support Cockpit for n8n Companies

## What is Kairo
Kairo is an AI-powered support cockpit that helps companies using n8n manage
customer support more intelligently. It connects to Gmail, classifies incoming
emails, and routes/responds based on learned behavior per client.

## Monorepo Structure (Turborepo)
```
/
├── apps/
│   ├── landing/        # Next.js 15 — public marketing site
│   ├── dashboard/         # Vite + React 19 — main support dashboard
│   ├── kelan/          # Next.js 15 — admin panel (internal)
│   └── mobile/         # Expo (React Native) — mobile companion
├── packages/
│   ├── env/            # centralized env validation (@t3-oss/env-core)
│   ├── types/          # shared TypeScript interfaces
│   ├── i18n/           # shared translation resources (EN/ES)
│   ├── ui/             # shared ShadCN components
│   └── intelligence/   # modular LLM provider (Ollama / Anthropic)
│       └── prompts/    # versioned LLM prompts (YAML frontmatter + markdown)
├── supabase/
│   └── migrations/     # shared DB migrations (Postgres via Supabase)
├── scripts/
│   └── eval/           # offline evaluation scripts (KAI-97 / KAI-106)
│       ├── run_pipeline_eval.ts  # runs 50 .eml files through pipeline → CSV
│       ├── tsconfig.json         # extends root; typeRoots → packages/intelligence/node_modules/@types
│       ├── lib/
│       │   ├── parse-eml.ts      # zero-dep EML parser (headers, base64, QP, multipart)
│       │   └── write-csv.ts      # CSV writer
│       └── data/
│           ├── input/eml/        # place 001.eml … 050.eml here before running
│           └── output/           # pipeline_output_50.csv + pipeline_eval_run.log
├── kairo-internal/
│   ├── architecture/   # 17 Architecture Decision Records (ADR-001 to ADR-017)
│   └── varios/         # legacy design docs, ideation, architecture specs
├── docs/
│   └── README.es.md    # Spanish documentation
├── PROJECT.md          # ← you are here (read this first, always)
├── CLAUDE.md
├── .cursorrules
└── .antigravity.md
```

## Tech Stack
| Layer       | Technology                        |
|-------------|-----------------------------------|
| Frontend    | Next.js 15, Vite, React 19        |
| Mobile      | Expo (React Native)               |
| Database    | Supabase (Postgres + Auth)        |
| AI          | Claude API (prod) / Ollama (local)|
| Email       | Gmail API (OAuth, sync active)    |
| Deploy      | Vercel                            |
| Language    | TypeScript (strict, no `any`)     |
| Tests       | Vitest                            |
| Monorepo    | Turborepo + Bun                   |

## What's Working Today
- Auth & onboarding (Supabase Auth + Google OAuth + email/password)
- Gmail sync (OAuth connected, emails being pulled)
- Client CRUD (full module with database persistence)
- Session management
- Profile settings with password change
- i18n (EN/ES) on landing page, login page, and dashboard password settings
- Shared component library (`packages/ui`) with ShadCN
- Shared types (`packages/types`) with core schema
- Centralized env validation (`packages/env`) via `@t3-oss/env-core` + Zod
- Intelligence layer (`packages/intelligence`) — modular LLM provider abstraction (Ollama / Anthropic)
- Email classification prompt versioned as markdown artifact (`packages/intelligence/prompts/email-classification.md` v1.0.0)
- DB schema with AI classification constraints (migration 005)
- Supabase migrations consolidated at repo root (`supabase/migrations/`)
- Pipeline eval script (`scripts/eval/`) — runs .eml files through classification → CSV (KAI-106)

## What's NOT Built Yet
- Email classification wired end-to-end (prompt exists, API call not integrated)
- Conversation UI (sending messages to clients) — components scaffolded, not wired
- i18n on remaining dashboard forms and views
- Intelligence layer per-client learning / feedback loop
- Mobile app (scaffolded, not functional)

## Code Conventions
- TypeScript strict mode everywhere — no `any`, no implicit returns on async
- Components: PascalCase in `/components`
- Hooks: camelCase prefixed `use` in `/hooks`
- i18n: **every user-facing string must exist in both ES and EN** — no exceptions
- i18n files live in `apps/dashboard/src/i18n/resources/{en,es}/*.json` — NOT in `packages/i18n/locales/`
- Error handling: always return typed errors, never throw raw strings
- Commits: conventional commits (`feat:`, `fix:`, `chore:`)

## i18n Rules (Critical)
Every form, button, label, and error message must have both languages.
Default detection: browser language. Fallback: EN.
If a component exists only in one language, it's considered incomplete.
Webapp i18n config: `apps/dashboard/src/i18n/config.ts`
Webapp translation files: `apps/dashboard/src/i18n/resources/{en,es}/*.json`

## Architecture Boundaries — Do NOT touch without discussing first
- `packages/intelligence/` — email classification logic, prompt engineering, per-client learning
- Supabase schema changes — always require a migration file in `supabase/migrations/`
- Gmail OAuth scopes — changes affect existing connected accounts

## Branch Strategy
- `main` — production
- `feature/[spec-name]` — one branch per spec

## Common Commands

| Command | What it does |
|---------|-------------|
| `bun run dev` | Start dashboard + landing + kelan dev servers |
| `bun run build` | Turbo full monorepo build |
| `bun test` | Run Vitest across all packages |
| `bun run eval:pipeline` | Run 50 .eml files through classification pipeline → `scripts/eval/data/output/` |
| `supabase db diff --schema public` | Check for uncommitted schema changes |
| `supabase migration new <name>` | Create a new migration file |
| `supabase db push` | Apply migrations to the local/remote DB |
| `supabase db dump --schema public > supabase/schema.sql 2>/dev/null` | Snapshot current schema |
| `supabase gen types typescript --schema public > packages/types/src/database.ts 2>/dev/null` | Regenerate TS types from DB |

## How Agents Should Work on This Repo
1. Read this file (`PROJECT.md`) completely before doing anything
2. Check `specs/pending/` for the assigned spec file
3. Implement on a new branch `feature/[spec-name]`
4. Run `bun test` before considering done
5. Move spec file from `specs/pending/` to `specs/done/`
6. Write a brief summary of what changed at the top of the spec file
