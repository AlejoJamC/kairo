# Supabase Migration Skill

## CRITICAL RULE

**Never write raw SQL and tell the user to paste it into the Supabase dashboard.**
**Never apply schema changes without going through the Supabase CLI workflow.**

Every schema change — no matter how small — follows the workflow below. No exceptions.

---

## When this skill applies

Use this skill whenever:
- A task requires adding, modifying, or removing a table, column, constraint, or index
- A task references `supabase/migrations/`
- A task involves any Postgres schema change in the Kairo repo

---

## The only valid migration workflow

### Step 1 — Check current state

Before writing any SQL, understand what already exists:

```bash
supabase db diff --schema public
```

If the output shows unexpected changes, stop and report them to the user before proceeding.

Also check what migrations have already been applied:

```bash
ls supabase/migrations/
```

And verify the canonical schema dump is current:

```bash
cat supabase/schema.sql | head -50
```

### Step 2 — Create the migration file

Never write a raw `.sql` file manually. Use the CLI to create a versioned migration:

```bash
supabase migration new <descriptive_snake_case_name>
```

This creates `supabase/migrations/<timestamp>_<name>.sql`.

Write the SQL into that file. The SQL must be:
- Idempotent where possible (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Non-destructive unless explicitly requested (never DROP without confirmation)
- Consistent with existing naming conventions in `supabase/migrations/`

### Step 3 — Diff before pushing

Always run a diff to confirm exactly what the migration will change:

```bash
supabase db diff --schema public
```

Show the output to the user and wait for confirmation before pushing.

### Step 4 — Push to remote

```bash
supabase db push
```

If this fails, do not attempt to apply the SQL manually. Report the error.

### Step 5 — Update the canonical schema dump

After every successful push, update the source of truth:

```bash
supabase db dump --schema public > supabase/schema.sql
```

Commit this file alongside the migration.

### Step 6 — Regenerate TypeScript types

After every schema change, regenerate types so `packages/types` stays in sync:

```bash
supabase gen types typescript --schema public > packages/types/src/database.ts
```

Commit this file alongside the migration and schema dump.

---

## Naming conventions

Migration files must follow the existing numbering pattern:

```
001_initial_schema.sql
002_create_tickets_table.sql
003_kairo_core_schema.sql
...
008_<next_descriptive_name>.sql
```

The timestamp prefix is added automatically by `supabase migration new`. The descriptive name must be snake_case and describe what the migration does, not what issue it belongs to.

---

## What never to do

- Never paste SQL into the Supabase dashboard SQL editor
- Never create a `.sql` file in `supabase/migrations/` manually without using `supabase migration new`
- Never push schema changes without running `supabase db diff` first
- Never skip updating `supabase/schema.sql` after a push
- Never skip regenerating `packages/types/src/database.ts` after a schema change
- Never DROP a column, table, or constraint without explicit user confirmation
- Never add a NOT NULL column without a DEFAULT or a backfill strategy

---

## Current schema reference

The canonical schema is always at `supabase/schema.sql`.

Current migrations applied (as of KAI-104):
- 001_initial_schema — profiles, gmail_accounts, RLS, triggers
- 002_create_tickets_table — tickets table
- 003_kairo_core_schema — core schema extensions
- 004_create_clients_table — clients table, tickets.client_id FK
- 005_ai_classification_constraints — CHECK constraints + ai_reasoning, classified_at, classification_confidence
- 006_add_classification_tier — tickets.classification_tier INT
- 007_add_message_classification_fields — messages classification_status, skip_reason, processing_tier, classified_at

Next migration will be: `008_<name>.sql`

---

## Supabase CLI reference

```bash
supabase login                          # authenticate
supabase link --project-ref <ref>       # link to remote project
supabase db diff --schema public        # diff local vs remote
supabase migration new <name>           # create versioned migration file
supabase db push                        # apply pending migrations to remote
supabase db dump --schema public        # dump full schema
supabase gen types typescript           # generate TypeScript types from schema
supabase migration list                 # list applied migrations
```
