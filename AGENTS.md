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

## ⛔ No dates or phase labels in source code comments

A comment citing a Linear ticket carries only the bare id (`KAI-55` — already
the codebase's own convention). Never a date, never "Fase N" / "Phase N",
never sample sizes or an execution narrative ("measured on n=50, 27-sep").
That belongs in the Linear comment, never in the code — it rots immediately
and nobody reads a commit message through a source file. Before writing or
editing any comment that cites a ticket, check it for anything beyond the
bare id and strip it.

---

**Read `PROJECT.md` in full before doing anything else.**

## Meta rules (read before anything else)

- The root `AGENTS.md` is the only canonical file for project agent instructions, shared by Codex, Claude and other agents.
- `.claude/CLAUDE.md` must remain a relative symlink to `../AGENTS.md`, never an independent file. Reading or writing through that link accesses the same content. Agents must edit the root `AGENTS.md` directly and preserve the symlink.
- Add or update project agent rules only in `AGENTS.md`. Never create another project instruction file or maintain separate rules under `.claude/rules/` or `.codex/`.
- Before creating any new configuration file, check whether it already exists in the project.
- When a spec or task says "create X file" — verify it doesn't already exist first.

## Project
Kairo — AI support cockpit for support teams. Monorepo: dashboard (Vite+React19), landing (Next.js 15), api (Bun+Hono), mobile (Expo). See `PROJECT.md` for full architecture, conventions, and boundaries.

## ⛔ Environment files

- `.env.example` is the only environment file in the repository and the only one agents may read, cite or edit.
- Every other environment file (`.env`, `.env.local` or any other name) is gitignored and off limits: never read, grep, print, filter, edit or suggest editing it, and never mention its name or contents.
- A command that needs a different value receives it inline (`VAR=value bun --env-file=.env.local ...`); the user's ignored files are never changed.

## Business value premises

- **Onboarding is the first value premise.** When an inbox is connected, Tier 1 processes the most recent `FAST_PATH_SCAN_SIZE` emails, newest first, one after another. It is never a random sample.
- **Onboarding evals** sample `FAST_PATH_SCAN_SIZE` emails at random from the golden data, never the full corpus. The golden data is always larger than that sample and evals run repeatedly against it; a random draw replicates an unknown new inbox.
- Never run evals or any call that spends model credits without an explicit instruction in that message. Do not change eval or model configuration (routing, mailboxes, reasoning, token budgets) unless asked.

## Implementation and workflow

- When a Linear issue is referenced, its description is the specification and its acceptance criteria define completion. Read the applicable specification in full before implementing.
- Preserve the approved Linear issue description during execution. Only change existing acceptance-criteria checkbox states, based on evidence. Never append implementation logs, progress, validation reports or explanations to the issue body, and never rewrite or add acceptance criteria without explicit user authorization.
- Put relevant implementation findings, validation results and blockers in a brief execution comment on the same issue. Keep the comment factual and useful as a source of knowledge; do not repeat the specification or conversation.
- If the user explicitly authorizes a specification correction, retain the original text with strikethrough, add the correction date and write the replacement. Never silently replace or delete the original specification. A user-authorized proposed acceptance criterion must remain unchecked and italicized until the user accepts it.
- Inspect affected files before implementing. Resolve routine implementation choices from the code and existing context; ask about material ambiguity in product behavior.
- Values compared across tables: read both column definitions in `supabase/schema.sql` (CHECK constraints, enums, casing) before comparing or joining them, reuse the existing normalizer (e.g. `normalizePlanTier`) instead of comparing raw values, and add a test that covers every allowed value.
- Data the code reads must have a writer: before depending on a column or field (e.g. `tickets.client_id`), confirm something populates it, or add the writer in the same change together with a backfill for existing rows.
- No placeholder literals where the specification requires a derived value (e.g. a fixed `'unknown'`). Derive it from the available sources, or report the field as missing.
- Inspect Git status and preserve existing work. Do not create or switch branches, create worktrees, or start a Git flow unless the user explicitly instructs it. Never require a clean checkout by discarding changes.
- All code, code comments and commit messages must be in English. User-facing strings must follow the project's EN/ES localization requirements.
- Commit messages must never include signatures, attribution footers, `Co-Authored-By`, `Signed-off-by`, or "Generated with" text. Use the configured Git author; never add an agent or model as an author.
- Run relevant tests and typechecks after implementation unless the user has explicitly paused validation. Dashboard changes require the dashboard typecheck used by Vercel (`turbo run typecheck --filter=@kairo/dashboard`); passing tests alone do not establish type safety.
- Changes to intelligence behavior require explicit user authorization.
- For file-based specifications, move the existing specification from `specs/pending/` to `specs/done/` and add a brief implementation summary only when the work and required validation are complete.
- Keep long-running task progress concise and free of customer or evaluation data. Do not introduce a separate agent instruction file to persist progress.

## Feature documentation

- READMEs describe the domain and its current usage: purpose, commands, configuration and outputs. Keep them concise and understandable without conversation history.
- Never frame feature documentation around Linear issues, AC numbers, implementation phases, agent activity or explanations of previous mistakes. Execution history belongs in the issue's execution comments.
- Before saving documentation, remove any sentence that does not help someone use or maintain the feature. Do not create extra documentation unless requested or necessary for operation.

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
