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
│   ├── webapp/         # Vite + React 19 — main support dashboard
│   ├── mobile/         # Expo (React Native) — mobile companion
│   └── api/            # Bun + Hono — backend API
├── packages/
│   ├── types/          # shared TypeScript interfaces
│   ├── i18n/           # shared translation resources (EN/ES)
│   └── ui/             # shared ShadCN components
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
| API         | Bun, Hono                         |
| Database    | Supabase (Postgres + Auth)        |
| AI          | Claude API (batch mode)           |
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

## What's NOT Built Yet
- Email classification with Claude API
- Conversation UI (sending messages to clients) — components scaffolded, not wired
- i18n on remaining dashboard forms and views
- Intelligence layer (per-client learning)
- Mobile app (scaffolded, not functional)

## Code Conventions
- TypeScript strict mode everywhere — no `any`, no implicit returns on async
- API routes: REST pattern under `/api/v1/[resource]`
- Components: PascalCase in `/components`
- Hooks: camelCase prefixed `use` in `/hooks`
- i18n: **every user-facing string must exist in both ES and EN** — no exceptions
- i18n files live in `apps/webapp/src/i18n/resources/{en,es}/*.json` — NOT in `packages/i18n/locales/`
- Error handling: always return typed errors, never throw raw strings
- Commits: conventional commits (`feat:`, `fix:`, `chore:`)

## i18n Rules (Critical)
Every form, button, label, and error message must have both languages.
Default detection: browser language. Fallback: EN.
If a component exists only in one language, it's considered incomplete.
Webapp i18n config: `apps/webapp/src/i18n/config.ts`
Webapp translation files: `apps/webapp/src/i18n/resources/{en,es}/*.json`

## Architecture Boundaries — Do NOT touch without discussing first
- `src/intelligence/` — email classification logic, prompt engineering, per-client learning
- Supabase schema changes — always require a migration file
- Gmail OAuth scopes — changes affect existing connected accounts

## Branch Strategy
- `main` — production
- `feature/[spec-name]` — one branch per spec

## How Agents Should Work on This Repo
1. Read this file (`PROJECT.md`) completely before doing anything
2. Check `specs/pending/` for the assigned spec file
3. Implement on a new branch `feature/[spec-name]`
4. Run `bun test` before considering done
5. Move spec file from `specs/pending/` to `specs/done/`
6. Write a brief summary of what changed at the top of the spec file
