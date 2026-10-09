# AI evaluation

All remote evaluations use Vercel AI Gateway. Local Ollama is the only exception. Configure server credentials in the root `.env.local`; never put credentials in scripts, fixtures, output examples or chat.

## Synthetic Gateway validation

After the user confirms the key is configured:

```sh
bun --env-file=.env.local scripts/eval/run_gateway_smoke.ts
```

The smoke runner uses invented inputs. It checks native decisions and generative classification separately for onboarding, history and new mail. It prints model identity, dimensions, review coverage, latency and provider-reported cost. Missing cost remains unknown. It does not access private data or mutate product records.

## Private evaluation

Customer inputs, labels, identifiers, logs and reports must stay under `scripts/eval/data/`, which is private and ignored by Git. Never copy them into tracked docs, tests, comments or external tools. Refer to an email only by numeric corpus position. A configured Gateway key does not authorize a private corpus run.

Existing runners retain their purposes:

- `run_pipeline_eval.ts`: configured classifier, with `EVAL_STAGE=onboarding|backfill|new_email`.
- `run_matrix_eval.ts`: model comparison. `EVAL_GATEWAY_MODELS` lists comma-separated language model IDs; `EVAL_DECISION_MODELS` lists native decision IDs. Each is evaluated separately per stage.
- `run_layered_eval.ts`: envelope facts, routing policy, model judgments and deterministic derivation.
- `compute_metrics.ts`: label metrics and calibration from private output.

Evaluate classification dimensions separately, consequential routing errors, abstention, automatic coverage, latency and reported cost. Keep native question versions, prompt versions and deterministic composition versions in the evaluation identity. Do not transfer a confidence threshold between models or stages without calibration evidence.

Compatibility checks and synthetic cases do not prove production accuracy. Validation of persistence recovery, degraded retrieval and conversational tools belongs in the application regression suite.
