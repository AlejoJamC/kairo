# Kairo Pipeline Eval — KAI-106

Runs 50 raw `.eml` files through the Kairo email classification pipeline and
writes a structured CSV with the pipeline's predictions. Used as input to the
KAI-97 evaluation framework for comparison against human ground truth.

## Prerequisites

- `ANTHROPIC_API_KEY` set in `.env` (root of monorepo), or
- `INTELLIGENCE_PROVIDER=ollama` with a local Ollama instance running

## Data layout (private repo)

`scripts/eval/data/` is a **separate private git repo** — it holds real company
emails and is fully ignored by this monorepo (see root `.gitignore`). Nothing
under it, including its own README, is visible from here, so the expected tree
is documented in this file:

```
scripts/eval/data/
├── input/
│   ├── ground_truth_50.csv    ← produced by KAI-102 (raw two-annotator sheet;
│   │                            adapted in memory at run time — never edited)
│   ├── _meta.json             ← optional: { "inter_annotator_agreement": <number> }
│   └── eml/
│       └── 001.eml … 050.eml  ← raw source emails
└── output/                    ← auto-created by the scripts
    └── <provider>-<model>/    ← one directory PER RUN, e.g. ollama-granite4.1-3b
        ├── pipeline_output_50.csv   (includes provider + model columns)
        ├── eval_report.md / eval_report.json
        └── *.log
```

Each run's identity comes from `INTELLIGENCE_PROVIDER` + `OLLAMA_MODEL` /
`ANTHROPIC_MODEL` at launch time; runs with different models never share or
overwrite files. `eval:metrics` resolves the same directory from the same env
vars, or takes it explicitly: `bun run eval:metrics <run-dir-name>`.

Cloning this monorepo alone is not enough to run the eval — the private data
repo must be present at `scripts/eval/data/`.

## Setup

1. **Place your `.eml` files** in `scripts/eval/data/input/eml/`
   - Name them `001.eml` through `050.eml`
   - The numeric prefix becomes the `email_id` in the output CSV

2. **Install dependencies** (if not already done):
   ```bash
   bun install
   ```

## Running

```bash
# From monorepo root
bun run eval:pipeline
```

## Output

| File | Description |
|------|-------------|
| `scripts/eval/data/output/pipeline_output_50.csv` | Pipeline predictions, one row per email |
| `scripts/eval/data/output/pipeline_eval_run.log` | Per-run execution log with timing and errors |

### CSV columns

| Column | Description |
|--------|-------------|
| `email_id` | Zero-padded filename prefix (`001`–`050`) |
| `filename` | Original filename (`001.eml`) |
| `provider` | Provider that ran this row (`ollama` / `anthropic`) |
| `model` | Actual model reported by the provider's response metadata |
| `predicted_ticket_type` | `support` / `prospect` / `spam` / `internal` / `other` |
| `predicted_priority` | `P1` / `P2` / `P3` |
| `predicted_category` | `technical` / `billing` / `account` / `general` / `not_applicable` |
| `predicted_tone` | `aggressive` / `frustrated` / `neutral` / `positive` |
| `predicted_urgency` | `high` / `medium` / `low` |
| `confidence` | `0.0`–`1.0` as returned by the pipeline |
| `processing_tier` | `0` — the eval calls the classifier directly and does not run any tier. In production this column is an integer written by the pipeline: `1` fast-path, `2` background, `3` deferred, `0` incremental-sync |
| `processing_time_ms` | Wall clock time for this email |
| `raw_reasoning` | The `reasoning` field from the pipeline |
| `error` | Error message if classification failed, empty otherwise |

## Interpreting errors

- Each failed email is recorded with an empty prediction and the error message
  in the `error` column
- The full error is also written to `pipeline_eval_run.log`
- The script continues after individual failures and reports a final count
- Common causes: malformed `.eml`, missing API key, provider timeout

## Notes

- Temperature is forced to `0` for deterministic, reproducible results
- Emails are processed **sequentially** (one at a time) so `processing_time_ms` is the
  clean latency of a single call — the figure that governs Tier 1, where the first
  ticket renders as soon as the first of several parallel calls returns
- Wall-clock for 50 emails depends entirely on the model: measured 3 min (Claude Haiku 4.5)
  to 52 min (a 31B open-weight model). Do not read it as a pipeline number — production
  dispatches classifications in parallel
- The eval does **not** execute the tier pipeline: no Inngest, no Gmail fetch, no Tier 0
  pre-filter, no persistence. It measures the classifier, not the orchestration
- This script does **not** require or read `ground_truth_50.csv`
- Comparison against ground truth is handled separately in KAI-97
