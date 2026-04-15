## ⛔ NEVER commit or push without an explicit instruction
**NEVER run `git commit`, `git push`, or any destructive git command unless the user explicitly says "commit" or "push" in that message. Implementing code does NOT mean commit. Finishing a task does NOT mean commit. Wait. Always wait for the explicit order.**

---

**Read `PROJECT.md` in full before doing anything else.**

## Meta rules (read before anything else)

- This file (`.claude/CLAUDE.md`) is the single source of project instructions. Do NOT create a root `CLAUDE.md` or any duplicate instruction file.
- Before creating any new config, rule, or instruction file: check if one already exists in `.claude/`.
- When a spec or task says "create X file" — verify it doesn't already exist first.

## Project
Kairo — AI support cockpit for n8n companies. Monorepo: dashboard (Vite+React19), landing (Next.js 15), api (Bun+Hono), mobile (Expo). See `PROJECT.md` for full architecture, conventions, and boundaries.

## Database migrations

All schema changes must go through the Supabase CLI workflow.
Never write raw SQL and paste it into the Supabase dashboard.
See `supabase/SKILL.md` for the full enforced workflow.

Before ANY migration task:
1. `supabase db diff --schema public`
2. `supabase migration new <descriptive_name>`
3. Write SQL into the generated file
4. `supabase db push`
5. `supabase db dump --schema public > supabase/schema.sql`
6. `supabase gen types typescript --schema public > packages/types/src/database.ts`
7. Commit `schema.sql` + `database.ts` + migration file together
