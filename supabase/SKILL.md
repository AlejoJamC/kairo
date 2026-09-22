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

### Step 3 — Diff, then stop

```bash
supabase db diff --linked --schema public 2>/dev/null
```

Read-only. It confirms the only pending difference is the migration just
written — anything else is pre-existing drift and has to be resolved before
going further.

**This is where a migration task ends.** Wire the code, write the tests,
typecheck, and report. Nothing below this line runs yet.

---

## ⛔ The remote gate

Steps 4 to 6 touch the linked project. **They do not run while the migration is
uncommitted and under review.** An unreviewed migration applied to the remote is
a change nobody approved, on the only copy of the data, and undoing it needs a
second migration.

**Approval is the commit instruction.** When the user says "commit" for a
migration, that is the moment these steps are allowed, as part of processing
that commit. Not when the code looks finished, not when the tests pass, not
because this file lists them.

`--linked` on every command: without it they target the local stack on 54322.
`2>/dev/null` on every redirect: with a bare `>` the CLI's logs land inside the
file and `gen types` truncates it to 0 bytes.

### Step 4 — Push to remote

```bash
supabase db push --linked
```

If this fails, do not attempt to apply the SQL manually. Report the error.

### Step 5 — Update the canonical schema dump

```bash
supabase db dump --linked --schema public > supabase/schema.sql 2>/dev/null
```

### Step 6 — Regenerate TypeScript types

```bash
supabase gen types typescript --linked --schema public > packages/types/src/database.ts 2>/dev/null
```

Then commit the migration, `schema.sql` and `database.ts` together.

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
supabase db push --linked               # apply pending migrations to remote (only after approval)
supabase db dump --linked --schema public  # dump full schema (only after approval)
supabase gen types typescript --linked  # generate types from schema (only after approval)
supabase migration list                 # list applied migrations
```
