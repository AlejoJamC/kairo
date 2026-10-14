# Kairo evals

Evaluate email classification and decision workflows against expected answers and review rubrics.

## Run

From the repository root:

```sh
# Preview configured models without inference or corpus reads
bun --env-file=.env.local evals/run.ts plan main 30 100

# Execute: dataset, optional case limit, optional request limit (default: 100)
bun --env-file=.env.local evals/run.ts execute main 30 100
bun --env-file=.env.local evals/run.ts execute coverage
bun --env-file=.env.local evals/run.ts execute synthetic

# Recalculate scores after reviewing a run
bun evals/run.ts report <run-id>
```

- `main`, `coverage`: private email corpora and golden labels; onboarding classification. `EVAL_LANG` defaults to `es`.
- `synthetic`: invented cases for classification, historical learning, incoming decisions, enrichment and reply suggestions. Models are real; storage and retrieval use fixtures.

Models come from the application's role configuration. The runner displays resolved models before inference. Classification makes one call per case, or two with a language ensemble. Other workflows call models conditionally. Invalid model answers are recorded as failed cases and evaluation continues. Transport failures, missing BYOK evidence and the request limit stop execution.

## Onboarding knowledge chain

```sh
bun --env-file=.env.local evals/onboarding.ts plan main
bun --env-file=.env.local evals/onboarding.ts execute main
# Optional request cap and seed to reproduce a sample
bun --env-file=.env.local evals/onboarding.ts execute main 180 <seed>
bun evals/onboarding.ts report <run-id>
```

Samples `FAST_PATH_SCAN_SIZE` emails (application default: 30) randomly without replacement. A smaller corpus is used in full. Each run saves its seed and selected positions; neither corpus nor labels are modified.

Runs the production routing, classification, scoring, ticket creation and source-linking services, then the historical learning consumer on those same saved messages. Explicit message references join conversations; missing history and business context are not fabricated. Drafts pass source-quote checks and semantic validation before becoming proposals for human review.

Per admitted email: classification **1** call (**2** with ensemble), evidence analysis **1**, historical decision **1**, knowledge candidate **1**, draft **up to 1**, validation **up to 1**. Maximum **6**, or **7** with ensemble. Filtered mail uses **0**. The default request cap is sample size × maximum; retries also consume that cap. `plan` lists each step, condition and configured model role.

Storage and empty approved-knowledge retrieval are isolated fixtures. This is a service-chain evaluation: Gmail, Inngest, SQL triggers, database permissions, outbound effects and human approval are not executed. Learning is explicitly dispatched by the eval because Tier 1 currently does not enqueue it for its sample; the report exposes this gap. Proposals never become approved knowledge automatically.

Private outputs: `scripts/eval/data/output/onboarding/<run-id>/`. `manifest.json` records configuration and sample; `trace.json` lists executed steps; `run.json` contains calls, outputs and saved records; `measurements.json`, `reviews.json` and `report.json` support quality review. Failures and model responses remain private. A new run gets a separate directory.

## Results

Runs are stored privately in `scripts/eval/data/output/ac11/<run-id>/`:

- `run.json`: inputs, outputs, model routes, prompt fingerprints, requests and Gateway responses (including rejected answers).
- `reviews.json`: human ratings; use `true` or `false`, leaving unobserved outcomes `null`.
- `report.json`: quality, abstention, coverage, latency and available cost measurements.
- `diagnostics.json`: private execution diagnostics.

Keep corpus data, golden labels and results under `scripts/eval/data/`, never in this directory. Scores from private corpora and synthetic cases remain separate.

## Local checks

```sh
bunx --no-install tsc --noEmit -p evals/tsconfig.json
bun evals/technical.ts
# Requires a prepared disposable PostgreSQL database on localhost:55494
bun evals/technical.ts --database
```

Model execution permits Vercel AI Gateway and local Ollama. Gateway responses must confirm BYOK; otherwise subsequent requests stop. This check occurs after the response and cannot prevent billing of that first request. Evaluation runs do not connect to Gmail or the product database.
