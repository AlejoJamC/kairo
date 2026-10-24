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

- **Kairo is not a CRM, a helpdesk add-on or a complement to Zendesk-style platforms.** Its customers have neither the time nor the interest to configure tools or pay someone to configure them: value must appear from the connected inbox with zero setup.
- **The differentiator is unlocking each company's own business knowledge from its support.** Triage is the entry point, not the product.
- **BYOK is an optional per-account switch, off by default.** Kairo's own keys are the default; when an account turns BYOK on, its model costs reach it directly. Kairo only offers models from its evaluated pool. Never make BYOK mandatory or require per-account manual setup.
- **The Vercel AI SDK is the agent framework that orchestrates the intelligence pipelines.** Each workflow runs as an SDK agent with shared tools (conversation and knowledge retrieval, typed judgments, embeddings, proposal writes); deterministic code resolves lookups, SLA, permissions, eligibility and transitions; Inngest provides durability and retries. Never propose demoting the SDK to a side role or replacing it.
- **Onboarding is the first value premise.** When an inbox is connected, Tier 1 processes the most recent `FAST_PATH_SCAN_SIZE` emails, newest first, one after another. It is never a random sample.
- **Onboarding evals** sample `FAST_PATH_SCAN_SIZE` emails at random from the golden data, never the full corpus. The golden data is always larger than that sample and evals run repeatedly against it; a random draw replicates an unknown new inbox.
- Never run evals or any call that spends model credits without an explicit instruction in that message. Do not change eval or model configuration (routing, mailboxes, reasoning, token budgets) unless asked.

## Implementation and workflow

- When a Linear issue is referenced, its description is the specification and its acceptance criteria define completion. Read the applicable specification in full before implementing.
- Preserve the approved Linear issue description during execution. Only change existing acceptance-criteria checkbox states, based on evidence. Never append implementation logs, progress, validation reports or explanations to the issue body, and never rewrite or add acceptance criteria without explicit user authorization.
- Never change a Linear issue's workflow status without an explicit human instruction to change that status. Validating or checking acceptance criteria, finishing implementation, passing tests, or committing does not authorize a status transition; an open, unmerged PR does not authorize marking the issue Done. Omit status fields from all other issue updates.
- Put relevant implementation findings, validation results and blockers in a brief execution comment on the same issue. Keep the comment factual and useful as a source of knowledge; do not repeat the specification or conversation.
- If the user explicitly authorizes a specification correction, retain the original text with strikethrough, add the correction date and write the replacement. Never silently replace or delete the original specification. A user-authorized proposed acceptance criterion must remain unchecked and italicized until the user accepts it.
- Inspect affected files before implementing. Resolve routine implementation choices from the code and existing context; ask about material ambiguity in product behavior.
- When asked to read, investigate or validate code, complete the relevant search before answering. Locate entry points and follow imports and calls through the implementation, consumers, workers, tests and evals, including scripts outside the application's test directory. Read the relevant function bodies; filenames, search hits and prior conversation are not sufficient evidence. Before claiming that behavior or coverage is absent, search the relevant repository locations and trace indirect calls. Support conclusions with concrete file/function references and distinguish simulated dependencies from real integrations. Never present a search limited to one directory as a conclusion about the whole project. If access or another concrete blocker prevents verification, state the exact unverified scope instead of asserting absence, correctness or completion. Continue authorized read-only investigation without asking the user to repeat the instruction.
- Values compared across tables: read both column definitions in `supabase/schema.sql` (CHECK constraints, enums, casing) before comparing or joining them, reuse the existing normalizer (e.g. `normalizePlanTier`) instead of comparing raw values, and add a test that covers every allowed value.
- Data the code reads must have a writer: before depending on a column or field (e.g. `tickets.client_id`), confirm something populates it, or add the writer in the same change together with a backfill for existing rows. A backfill of business records or operational state requires the explicit data-migration authorization below; without it, stop and ask instead of preparing the backfill.
- No placeholder literals where the specification requires a derived value (e.g. a fixed `'unknown'`). Derive it from the available sources, or report the field as missing.
- Inspect Git status and preserve existing work. Do not create or switch branches, create worktrees, or start a Git flow unless the user explicitly instructs it. Never require a clean checkout by discarding changes.
- All code, code comments and commit messages must be in English. User-facing strings must follow the project's EN/ES localization requirements.
- Commit messages must never include signatures, attribution footers, `Co-Authored-By`, `Signed-off-by`, or "Generated with" text. Use the configured Git author; never add an agent or model as an author.
- Run relevant tests and typechecks after implementation unless the user has explicitly paused validation. Dashboard changes require the dashboard typecheck used by Vercel (`turbo run typecheck --filter=@kairo/dashboard`); passing tests alone do not establish type safety.
- Changes to intelligence behavior require explicit user authorization.
- For file-based specifications, move the existing specification from `specs/pending/` to `specs/done/` and add a brief implementation summary only when the work and required validation are complete.
- Keep long-running task progress concise and free of customer or evaluation data. Do not introduce a separate agent instruction file to persist progress.

## ⛔ Nothing is published that was not asked for

**Architecture decision records are private.** They live only in the git-ignored internal folder. Never create an ADR, a folder for ADRs or any architecture-decision document in a tracked location (`docs/`, `README`, `AGENTS.md`, skills, comments, Linear, commit or PR text), never propose one, and never quote or paraphrase the content of a private ADR in anything tracked. When a task or criterion calls for one, say so and wait for the explicit order: it is then written in the internal folder with the next free id.

**The rule is wider than ADRs.** Do not add any file, folder, document, section, rule or explanation to the repository or to an external tool unless the user asked for it in that message. A requirement found in a ticket, a spec or an earlier note is not an order to publish something; if its location is unclear, ask. Information that came from a private location never moves into a tracked one.

**Mistakes are reported, never hidden.** Do not delete, rewrite or "clean up" a wrongly published artifact on your own initiative, and do not rewrite pushed history without an explicit order: state what was published, where it is, and let the user decide.

## Frontend architecture

One component library and one set of design values serve every client (web dashboard, landing, kelan, mobile, desktop shell). Read `skills/kairo-ui/SKILL.md` before any UI work.

- **Layers.** `packages/tokens` holds the design values; `packages/ui` holds the components and their specifications (`packages/ui/spec`); `packages/client-core` holds data, session and platform ports; `apps/*` hold screens. `packages/ui` never imports `client-core`, data libraries or apps; `client-core` has no UI; apps never import each other. `bun run ui:boundaries` enforces it.
- **Find before writing.** `packages/ui/CATALOG.md` lists every specified piece and whether it exists. Use the export. If the piece is specified but missing, build it in `packages/ui` from its spec, with tests, before using it. Never define a local version of a specified piece inside an app.
- **The approved design is final.** A state or detail marked "Not defined in the approved design." or "Not designed" is not invented in code or in specs; ask.
- **Screens compose; they do not style.** No inline `style`, no color or hex literals, no Tailwind classes, no hand-written CSS color variables and no `@tamagui/*` imports in apps. Values come from `@kairo/tokens`; layout from `Box`, `Text` and `Pressable`; icons from `Icon`; overlays, forms and feedback from the library. A visual refactor of the dashboard is verified with the fixture preview (`apps/dashboard/preview`), which records every screen's layout before and after.
- **Views never touch the platform or the backend.** No `fetch`, `localStorage`, `window.location`, `navigator.clipboard` or Supabase in a view: use `@kairo/client-core` endpoints, queries, hooks and the platform ports.
- **Enforcement.** ESLint runs against a baseline (`apps/dashboard/eslint-suppressions.json`) that may only shrink: never add to it, and run `eslint --prune-suppressions` after fixing violations. An editor hook lints each dashboard file right after it is written. CI runs typecheck, tests, lint, boundaries, the catalog check and `ui:metrics`.
- **Reference.** `bun run ui:metrics` reports the remaining gap against the specification; `bun run ui:catalog` regenerates the catalog after a piece or its spec changes.

## Feature documentation

- READMEs describe the domain and its current usage: purpose, commands, configuration and outputs. Keep them concise and understandable without conversation history.
- Never frame feature documentation around Linear issues, AC numbers, implementation phases, agent activity or explanations of previous mistakes. Execution history belongs in the issue's execution comments.
- Before saving documentation, remove any sentence that does not help someone use or maintain the feature. Do not create extra documentation unless requested or necessary for operation.

## Documentation and execution comments

- Publish only information that helps someone use, maintain, verify or decide on the work. Remove sentences that add no actionable information before saving.
- Execution summaries contain the implemented outcome, reproducible validation commands and results, evidence references, and material limitations. Distinguish simulated dependencies from real integrations. Update the existing summary instead of adding repetitive comments.
- Do not publish session diaries, resolved incidental environment problems, agent activity, self-assessment, apologies, justifications, conversation recaps or announcements that the agent understood an instruction. Keep feature documentation independent of execution history.
- Report material failures, data impact and unresolved blockers truthfully and briefly; never hide them or present failed or omitted checks as successful. This does not authorize deleting existing artifacts without the human's instruction.

## Database migrations

All schema changes must go through the Supabase CLI workflow.
Never write raw SQL and paste it into the Supabase dashboard.
See `supabase/SKILL.md` for the full enforced workflow.

### ⛔ Do not turn schema installation into operational data processing

Schema migrations may define tables, relationships, constraints, indexes,
permissions and callable persistence/query interfaces. Known column defaults,
enum values and fixed reference catalogs are allowed when required by the
approved schema. This rule does not prohibit normal application writes or
synthetic fixtures inside isolated tests.

**The forbidden case is scanning existing business records during schema
installation to manufacture derived state or initiate operational work.**
Examples include `INSERT ... SELECT` over tickets or knowledge to populate a
job queue, bulk embedding/index generation, workflow replay, copying current
business records into a new operational representation, or rewriting their
processing state. Creating an empty index table does not authorize populating
it, selecting sources for it or scheduling their processing.

Do not hide these effects in `DO` blocks, function calls, seeds or helper
scripts, or introduce triggers on existing tables that assume responsibility
for scheduling business processing outside the approved consumer/pipeline
contract. Defining a callable RPC does not authorize invoking it in a migration.

**If this operational processing is needed, stop before writing or executing
that part and ask the human to explicitly authorize a data migration.** State
the affected tables, selection predicates and intended effects. Generic approval
to implement, apply schema migrations or commit does not authorize it. Without
that authorization, keep schema installation free of this processing and leave
source selection and execution with the application's consumers and pipelines.

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

### Additional gate: validate locally before the approved remote stage

The approval gate above remains mandatory and unchanged. Local application and
validation do not authorize remote execution or a commit. When the human has
explicitly authorized the full workflow, execute these dependent steps in order:
authorized local application and validation → approved remote application →
canonical schema and generated types → explicitly requested commit.

A local conflict, failed migration, failed test or unavailable local stack blocks
the remote application, even when the commit instruction has already been given.
Do not execute the remote stage as independent work while resolving a local
failure. Destructive local recovery requires explicit authorization and never
implies permission to reset the remote database. Do not add a repair migration
or alter migration history to bypass a failure without authorization.

Preserve existing agent rules when adding a compatible rule. An instruction to
add a rule does not authorize deleting, replacing or weakening an existing one.
