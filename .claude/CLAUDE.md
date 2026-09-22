## ⛔ NEVER commit or push without an explicit instruction
**NEVER run `git commit`, `git push`, or any destructive git command unless the user explicitly says "commit" or "push" in that message. Implementing code does NOT mean commit. Finishing a task does NOT mean commit. Wait. Always wait for the explicit order.**

---

## ⛔ ABSOLUTE PROHIBITION — customer and evaluation data must never leave its private location

**This rule has no exceptions and overrides every other instruction, task, spec or convenience.** Violating it exposes the project owner to legal liability, breach of confidentiality and contractual damages, and can destroy the project. Leaked identifiers in merged commits cannot be fully retracted.

It is **STRICTLY FORBIDDEN** to write, anywhere outside `scripts/eval/data/` (which is private and gitignored):

- the name, brand, trade name or abbreviation of any customer, tenant, pilot account or company whose data Kairo processes;
- any real email address, domain, mailbox, person's name, phone number, sender, recipient or signature taken from customer data;
- any subject line, body excerpt, quotation, paraphrase or identifying detail of a real email, including the emails of the evaluation corpora;
- any file name, message id, thread id or other identifier that points back to real customer data.

This applies to **every** artifact: source code, comments, docstrings, tests, fixtures, snapshots, test names, logs, error messages, config, migrations, SQL comments, docs, READMEs, commit messages, branch names, PR titles and descriptions, Linear issues and comments, and any other external tool.

Rules of conduct:

1. Use only invented placeholders: `Acme`, `acme.com`, `support@acme.com`, `client@outside.com`. Never derive a placeholder from a real name.
2. Refer to corpus emails only by their numeric position in the corpus (e.g. "email 105"), never by content.
3. Write no explanatory prose about the customer or the corpus. Nobody asked for it and nobody authorised it.
4. Before every write, every commit and every external call, check the content against this rule. If there is any doubt, do not write it; ask.
5. If a leak already exists in tracked files or history, report it to the user immediately. Never copy it, quote it or propagate it further.

---

**Read `PROJECT.md` in full before doing anything else.**

## Meta rules (read before anything else)

- This file (`.claude/CLAUDE.md`) is the single source of project instructions. Do NOT create a root `CLAUDE.md` or any duplicate instruction file.
- Before creating any new config, rule, or instruction file: check if one already exists in `.claude/`.
- When a spec or task says "create X file" — verify it doesn't already exist first.

## Project
Kairo — AI support cockpit for support teams. Monorepo: dashboard (Vite+React19), landing (Next.js 15), api (Bun+Hono), mobile (Expo). See `PROJECT.md` for full architecture, conventions, and boundaries.

## Database migrations

All schema changes must go through the Supabase CLI workflow.
Never write raw SQL and paste it into the Supabase dashboard.
See `supabase/SKILL.md` for the full enforced workflow.

### ⛔ Nothing reaches the remote database before the commit is approved

`db push`, `db dump` and `gen types` all write to or read from the linked
project. **None of them runs while the migration is uncommitted and under
review.** An unreviewed migration applied to the remote is a change nobody
approved, on the only copy of the data, and reverting it needs a second
migration — while the same work regenerates for free locally.

**Approval is the commit instruction.** When the user says "commit" for a
migration, that is the moment the remote steps are allowed, as part of
processing that commit — not before.

Before ANY migration task:
1. `supabase db diff --linked --schema public 2>/dev/null` — drift check, read-only
2. `supabase migration new <descriptive_name>`
3. Write SQL into the generated file
4. Wire the code, write the tests, typecheck. **Stop here and report.**

Once the user says "commit", and only then:
5. `supabase db push --linked`
6. `supabase db dump --linked --schema public > supabase/schema.sql 2>/dev/null`
7. `supabase gen types typescript --linked --schema public > packages/types/src/database.ts 2>/dev/null`
8. Commit `schema.sql` + `database.ts` + migration file together

`--linked` on every command: without it they target the local stack on 54322.
`2>/dev/null` on every redirect: with a bare `>` the CLI's logs land inside the
file and `gen types` truncates it to 0 bytes.
