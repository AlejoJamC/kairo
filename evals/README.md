# KAI-94 evaluations

Technical preparation (AC11) and measured results (AC12) are separate.
All new evaluation code lives here. Existing helpers, rubrics, golden labels,
data paths and ignore rules remain unchanged.

From the repository root:

```sh
# No model calls or corpus reads
bun evals/run.ts plan
bunx --no-install tsc --noEmit -p evals/tsconfig.json
bun evals/technical.ts

# Optional SQL guarantees: requires the already prepared disposable DB on port 55494
bun evals/technical.ts --database

# Real model execution: dataset, optional case limit, optional inference request limit
bun --env-file=.env.local evals/run.ts execute synthetic
bun --env-file=.env.local evals/run.ts execute main 30 100
bun --env-file=.env.local evals/run.ts execute coverage

# Offline scoring after reviewing the private results
bun evals/run.ts report <run-id>
```

`synthetic` exercises all five production entrypoints with invented cases.
Only storage, retrieval and logging are isolated; model answers and prompts are
real. SQL suites separately verify permissions, races and immutable effects.
`main` and `coverage` reuse existing private emails and classification labels
for onboarding; they are scored separately, never pooled with synthetic data.
They require the existing `EVAL_TENANT_MAILBOX`; `EVAL_LANG` defaults to `es`.

Outputs stay in `scripts/eval/data/output/ac11/<run-id>/`: `run.json` contains
inputs, outputs, actual model routes, prompt hashes and per-call metadata;
`reviews.json` contains the human rubric. Set each rating to `true` or `false`
after checking the corresponding sources and output. Leave unobserved usefulness
or confirmed-resolution outcomes `null`. `report` rejects stale review keys and
reports missing reviews, errors, F1, abstention, coverage, freshness, usefulness
and cost separately. Unknown cost is never reported as zero. No score enables
production autonomy or automatically closes AC12.

Execution is serial and stops on its first failed case or request limit. Network
access is limited to Vercel Gateway and local Ollama. Each Gateway response must
report BYOK; a violation stops further calls. This response check cannot prevent
Gateway from billing the first violating request. No remote database or migrations
are invoked. This folder must never contain corpus inputs, outputs or logs.
