# Kairo Pipeline Eval — KAI-106

Runs 50 raw `.eml` files through the Kairo email classification pipeline and
writes a structured CSV with the pipeline's predictions. Used as input to the
KAI-97 evaluation framework for comparison against human ground truth.

## Prerequisites

- `ANTHROPIC_API_KEY` set in `.env` (root of monorepo), or
- `INTELLIGENCE_PROVIDER=ollama` with a local Ollama instance running

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
| `predicted_ticket_type` | `support` / `prospect` / `spam` / `internal` / `other` |
| `predicted_priority` | `P1` / `P2` / `P3` |
| `predicted_category` | `technical` / `billing` / `account` / `general` / `not_applicable` |
| `predicted_tone` | `aggressive` / `frustrated` / `neutral` / `positive` |
| `predicted_urgency` | `high` / `medium` / `low` |
| `confidence` | `0.0`–`1.0` as returned by the pipeline |
| `processing_tier` | `0` — current pipeline is single-tier |
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
- Emails are processed **sequentially** (one at a time) — expect ~5–15 min for 50 emails
- This script does **not** require or read `ground_truth_50.csv`
- Comparison against ground truth is handled separately in KAI-97
