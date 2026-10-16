# Kairo evals

Evaluate email classification and decision workflows against expected answers and review rubrics.

## Run

From the repository root:

```sh
# Preview configured models without inference or corpus reads
bun --env-file=.env.local evals/run.ts plan main 30 100

# Execute: dataset, optional sample size, optional request limit (default: 100), optional seed
bun --env-file=.env.local evals/run.ts execute main
bun --env-file=.env.local evals/run.ts execute main 30 100 <seed>
bun --env-file=.env.local evals/run.ts execute coverage
bun --env-file=.env.local evals/run.ts execute synthetic

# Recalculate scores after reviewing a run
bun evals/run.ts report main latest
```

- `main`, `coverage`: private email corpora and golden labels; onboarding classification only, one call per email. Each run samples `FAST_PATH_SCAN_SIZE` emails at random (or the given size) and saves the seed and positions in the manifest. `EVAL_LANG` defaults to `es`.
- The corpus tenant's mailboxes come from the private `input/tenant_mailboxes.txt` (one per line) or `EVAL_TENANT_MAILBOX`, as Tier 1 reads them from the connected account. Without them every sender is external and `tenant_mailbox` is reported missing.
- `synthetic`: invented cases for classification, historical learning, incoming decisions, enrichment and reply suggestions. Models are real; storage and retrieval use fixtures.

Models come from the application's role configuration. The runner displays resolved models before inference. Classification makes one call per case, or two with a language ensemble. Other workflows call models conditionally. Invalid model answers are recorded as failed cases and evaluation continues. Transport failures, missing BYOK evidence and the request limit stop execution.

## Onboarding knowledge chain

```sh
bun --env-file=.env.local evals/onboarding.ts plan main
bun --env-file=.env.local evals/onboarding.ts execute main
# Optional request cap and seed to reproduce a sample
bun --env-file=.env.local evals/onboarding.ts execute main 180 <seed>
bun evals/onboarding.ts report main latest
```

Samples `FAST_PATH_SCAN_SIZE` emails (application default: 30) randomly without replacement. A smaller corpus is used in full. Each run saves its seed and selected positions; neither corpus nor labels are modified.

Runs the production routing, classification, scoring, ticket creation and source-linking services, then the historical learning consumer on those same saved messages. Explicit message references join conversations; missing history and business context are not fabricated. Drafts pass source-quote checks and semantic validation before becoming proposals for human review.

Per admitted email: classification **1** call (**2** with ensemble), evidence analysis **1**, historical decision **1**, knowledge candidate **1**, draft **up to 1**, validation **up to 1**. Maximum **6**, or **7** with ensemble. Filtered mail uses **0**. The default request cap is sample size × maximum; retries also consume that cap. `plan` lists each step, condition and configured model role.

The scenario starts with a new account, no approved knowledge and no supplied business context. It uses the same initial-sample queue writer as Tier 1. Production consumes this queue when `FEATURE_FLAG_ENABLE_EMAIL_KNOWLEDGE=true`; the eval directly runs its consumer. Inferred knowledge remains pending review.

Storage and retrieval are isolated fixtures. Gmail, Inngest, SQL triggers, database permissions and outbound effects are not exercised by this command.

`manifest.json` records configuration and sample; `trace.json` lists executed steps; `run.json` contains calls, outputs and saved records; `measurements.json`, `reviews.json` and `report.json` support quality review. Failures and model responses remain private.

## Tier 2 historical learning

With the application model environment loaded, from the repository root:

```sh
bun evals/tier2.ts plan main
bun evals/tier2.ts execute main
# Optional request cap and saved onboarding run (default: latest)
bun evals/tier2.ts execute main 120 <onboarding-run>
bun evals/tier2.ts report main latest
# Check classification independently, without repeating knowledge generation
bun evals/tier2.ts plan-classification main
bun evals/tier2.ts classify main
bun evals/tier2.ts report-classification main latest
```

Reuses a finished onboarding snapshot for the same dataset, including its tickets, pending proposals and account settings. Failed learning in that run does not prevent continuation. The initial inference is not repeated, and neither that snapshot nor the corpus is modified. Use `coverage` instead of `main` for that corpus.

`classify` uses the same historical selection, classifier and routing as the full run, stopping after ingestion. It calls no evidence, knowledge or validation models. Its outputs live in `tier2-classification/<dataset>/<UTC-date-time>/`, preserving the full workflow's latest result. The optional request cap and onboarding-run selector have the same order as `execute`.

Selects all dated corpus messages in `TIER_2_WINDOW_DAYS` (default: 15), excluding messages successfully classified or filtered during onboarding. Failed initial classifications remain eligible. The newest corpus date anchors a virtual inbox clock; the cutoff is midnight UTC, so fixtures remain replayable. Undated messages are reported as excluded. No random redraw or fixed email count is imposed on Tier 2.

Executes the production Tier 2 job for routing, backfill classification, ticket reuse/creation, source linkage and existing proposal approval gates. Its historical learning consumer reads the available saved conversation and produces grounded proposals with novelty/support/conflict checks. Replaying completed learning must add no inference or writes. Existing ticket classifications and human decisions are checked for preservation.

Tier 2 has an isolated model policy: message classification defaults to the configured language evidence model; historical judgments, candidate selection and validation use their configured decision roles. Analysis and drafting use their language roles. The initial-scan classification mode and ensemble are not inherited. `plan` displays the model, input, task and condition for every role. This evaluation policy does not change production defaults.

Optional `EVAL_TIER2_<ROLE>_MODEL` variables select models independently for `CLASSIFICATION`, `EVIDENCE_ANALYSIS`, `KNOWLEDGE_DECISION`, `KNOWLEDGE_DRAFT` and `VALIDATION`. `EVAL_TIER2_CLASSIFICATION_MODE=decision` selects native classification; without an explicit classifier it uses the knowledge-decision model. `EVAL_TIER2_ENSEMBLE=provider:model` enables a second language classifier. These choices are scoped to this evaluation, without changing process settings or concurrent initial-scan execution.

Per admitted email: classification **1** call (**2** with ensemble), evidence **1**, historical decision **1**, candidate selection **1**, draft **up to 1**, semantic validation **up to 1**. Maximum **6**, or **7** with ensemble. Existing shadow/canary settings can add calls; `plan` displays their allowance. Filtered mail uses **0**. The default request cap is eligible messages × the displayed maximum; retries count against it. Generation budgets remain those of the application.

Outputs live under `output/evals/tier2/<dataset>/<UTC-date-time>/` inside the private data directory, with their own `latest.json`. `manifest.json` records the baseline, virtual window, selected positions, exclusions, models and limits. `trace.json` records steps; `run.json` retains evidence and proposals. `report.json` separates classification scores, historical execution, new proposals, safety checks and cost. `measurements.json` and `reviews.json` support human assessment of support, scope, confirmed outcomes, contradictions and reuse; unreviewed knowledge is not reported as validated.

`report.json` compares each classification field's macro-F1 with **0.7, 0.8 and 0.9**, independently of execution status. Its 95% bootstrap intervals resample whole tickets, keeping related messages together. They estimate sampling uncertainty, not calibrated model confidence; a single ticket has no interval. `quality.proposals` separates invalid source references, duplicate knowledge, semantic support and pending human review. The report command recalculates these values from saved artifacts without inference.

Mailbox reads, persistence and queue-trigger behavior are fixtures. The production handler and model services execute; live Gmail, SQL triggers/RLS, durable Inngest execution, human approval, enrichment and Tier 3 are outside this evaluation. The Tier 3 handoff is recorded without running it.

## Tier 3 historical learning

```sh
bun evals/tier3.ts plan main
bun evals/tier3.ts execute main
# Optional request cap
bun evals/tier3.ts execute main 120
bun evals/tier3.ts report main latest
```

Reads the corpus directly into isolated account storage. No onboarding or Tier 2 execution, snapshot or result is required. Every corpus message enters the production Tier 3 message processor, followed by historical analysis, knowledge proposals, source validation, decision history and replay checks. Source dates remain unchanged; age never excludes a workflow case. Gmail calendar selection is tested separately. Empty input stops before inference.

`plan` lists the models, steps, conditions and call allowance. The maximum is **6 calls per admitted email**, plus configured ensemble/shadow/canary calls; retries consume the same hard request cap. Independent `EVAL_TIER3_<ROLE>_MODEL`, `EVAL_TIER3_CLASSIFICATION_MODE` and `EVAL_TIER3_ENSEMBLE` select routes using the historical role names above.

Private outputs use `tier3/<dataset>/<UTC-date-time>/` with their own `latest.json`. Reports separate classification quality, historical execution, pending proposals, safety and historical closure. Mailbox, storage and SQL behavior are fixtures; the enabled closing check queues no enrichment without approved knowledge. Proposals remain unapproved.

## Results

Runs are stored privately under `scripts/eval/data/output/evals/<mode>/<dataset>/<UTC-date-time>/`. Modes: `classification`, `workflows`, `onboarding`, `tier2`, `tier2-classification`, `tier3`, `technical`. Datasets: `main`, `coverage`, `synthetic`, `local`.

Each mode/dataset has `latest.json` with the latest run's directory, start time and status. Run folders sort chronologically, for example `2026-10-14_12-30-00-123Z`. `report main latest` recalculates the latest report; replace `latest` with a dated folder name for a specific run.

- `run.json`: inputs, outputs, model routes, prompt fingerprints, requests and Gateway responses (including rejected answers).
- `reviews.json`: human ratings; use `true` or `false`, leaving unobserved outcomes `null`.
- `report.json`: quality, abstention, coverage, latency and available cost measurements.
- `diagnostics.json`: private execution diagnostics.
- `warnings.json`: complete SDK warnings; `warningCount` in the report preserves their visibility without repeated terminal stacks. Requests record the sampling settings actually sent.

Keep corpus data, golden labels and results under `scripts/eval/data/`, never in this directory. Scores from private corpora and synthetic cases remain separate.

## Local checks

```sh
bunx --no-install tsc --noEmit -p evals/tsconfig.json
bun evals/technical.ts
# Requires a prepared disposable PostgreSQL database on localhost:55494
bun evals/technical.ts --database
```

Model execution permits Vercel AI Gateway and local Ollama. Gateway responses must confirm BYOK; otherwise subsequent requests stop. This check occurs after the response and cannot prevent billing of that first request. Evaluation runs do not connect to Gmail or the product database.
