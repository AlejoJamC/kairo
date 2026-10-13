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
