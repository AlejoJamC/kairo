import { join } from 'path';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
// Relative import: scripts/eval is not a workspace package, so the
// `@kairo/intelligence` specifier does not resolve at runtime (the tsconfig
// `paths` alias only covers type-checking)
import { classifyEmailWithJev, createDecisionProvider, stripQuotedThread } from '../../packages/intelligence/src/index';
import { parseEml } from './lib/parse-eml';
import { STAGE_BODY_RULES, slugify, type PipelineStage } from './lib/run-label';
import { PIPELINE_OUTPUT } from './lib/run-files';
import { writeCsv } from './lib/write-csv';
import { resolveCorpus } from './lib/corpus';

// ---------------------------------------------------------------------------
// KAI-55 Fase 4 — JEV as one more run against the same corpus/ground truth
// run_pipeline_eval.ts already measures Anthropic/Ollama against. Writes the
// same pipeline_output.csv shape (predicted_* + confidence + error) into its
// own run directory, so `eval:metrics jev` reads it with no changes to
// compute_metrics.ts. JEV has no prompt/temperature/tokens-per-second, so
// those columns are simply left blank for this run.
//
// A run's slug never changes between runs (there is only one JEV provider),
// so unlike run_pipeline_eval.ts's per-model directory there is nothing to
// keep a second run from silently overwriting the first — this script
// refuses instead, the same way run_matrix_eval.ts's assertSameRubric
// refuses to mix two measurements in one file. Archive the run directory or
// set EVAL_OUTPUT_ROOT before running again.
// ---------------------------------------------------------------------------

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const CORPUS = resolveCorpus();
const INPUT_DIR = join(SCRIPT_DIR, CORPUS.emlDir);

const STAGE: PipelineStage = process.env['EVAL_STAGE'] === 'onboarding' ? 'onboarding' : 'backfill';
const BODY_RULE = STAGE_BODY_RULES[STAGE];

const SLUG = slugify('jev') + (STAGE === 'onboarding' ? '-onboarding' : '');
const OUTPUT_ROOT = process.env['EVAL_OUTPUT_ROOT'] ?? join(SCRIPT_DIR, 'data/output');
const OUTPUT_DIR = join(OUTPUT_ROOT, CORPUS.outputSubdir, SLUG);
const OUTPUT_CSV = join(OUTPUT_DIR, PIPELINE_OUTPUT);
const LOG_FILE = join(OUTPUT_DIR, 'pipeline_eval_run.log');

function refuseIfRunExists(): void {
  if (!existsSync(OUTPUT_CSV)) return;
  console.error(`✗ ${OUTPUT_CSV} already exists.`);
  console.error('  A second run would silently overwrite it before spending a single call is worth it.');
  console.error('  Archive that directory (see scripts/eval/data/output/archive/), or set EVAL_OUTPUT_ROOT to a fresh one.');
  process.exit(1);
}

const TENANT_MAILBOX = process.env['EVAL_TENANT_MAILBOX'] ?? '';
const BUSINESS_CONTEXT = process.env['EVAL_BUSINESS_CONTEXT'] ?? '';

// If this many emails fail consecutively from the very start, the provider is
// systematically unreachable (bad key, model name, outage) — abort instead of
// burning the whole corpus producing identical errors.
const FAIL_FAST_THRESHOLD = 5;

interface OutputRow {
  email_id: string;
  filename: string;
  provider: string;
  model: string;
  pipeline_stage: string;
  predicted_ticket_type: string;
  predicted_priority: string;
  predicted_category: string;
  predicted_tone: string;
  predicted_urgency: string;
  confidence: number | string;
  processing_tier: number | string;
  processing_time_ms: number | string;
  raw_reasoning: string;
  error: string;
}

const CSV_COLUMNS: (keyof OutputRow)[] = [
  'email_id', 'filename', 'provider', 'model', 'pipeline_stage',
  'predicted_ticket_type', 'predicted_priority', 'predicted_category',
  'predicted_tone', 'predicted_urgency', 'confidence',
  'processing_tier', 'processing_time_ms', 'raw_reasoning', 'error',
];

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function formatDuration(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function main(): Promise<void> {
  refuseIfRunExists();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const provider = createDecisionProvider('jev');

  const allFiles = await readdir(INPUT_DIR);
  const emlFiles = allFiles.filter((f: string) => f.endsWith('.eml')).sort();

  const total = emlFiles.length;
  const padWidth = String(total).length;

  console.log('Kairo Pipeline Eval — JEV');
  console.log(`Run: jev / ${provider.model} → ${OUTPUT_DIR}`);
  console.log(
    `Stage:  ${STAGE} — body ${BODY_RULE.stripQuotes ? 'stripped of quoted thread' : 'raw, quotes intact'}, ` +
    `capped at ${BODY_RULE.maxChars.toLocaleString()} chars`
  );
  console.log(`Dataset: ${INPUT_DIR} (${total} files)`);
  console.log('─'.repeat(44));

  const rows: OutputRow[] = [];
  const logLines: string[] = [
    `[${new Date().toISOString()}] Kairo Pipeline Eval — JEV`,
    `Run: jev / ${provider.model}`,
    `Stage: ${STAGE} (strip=${BODY_RULE.stripQuotes}, cap=${BODY_RULE.maxChars})`,
    `Dataset: ${INPUT_DIR} (${total} files)`,
    '',
  ];

  let errorCount = 0;
  const runStart = performance.now();

  for (let i = 0; i < emlFiles.length; i++) {
    const filename = emlFiles[i] as string;
    const idx = i + 1;
    const emailId = filename.replace(/\.eml$/, '');
    const label = `[${pad(idx, padWidth)}/${pad(total, padWidth)}]`;

    const emailStart = performance.now();

    try {
      const rawContent = await readFile(join(INPUT_DIR, filename), 'utf-8');
      const parsed = parseEml(rawContent);

      const classifierBody = (
        BODY_RULE.stripQuotes ? stripQuotedThread(parsed.body) : parsed.body
      ).slice(0, BODY_RULE.maxChars);

      const message = {
        subject: parsed.subject,
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        body: classifierBody,
        threadDepth: parsed.threadDepth,
        attachments: parsed.attachments,
        ...(TENANT_MAILBOX ? { tenantMailbox: TENANT_MAILBOX } : {}),
        ...(BUSINESS_CONTEXT ? { businessContext: BUSINESS_CONTEXT } : {}),
      };

      const { result, decision } = await classifyEmailWithJev(message, provider);
      const elapsed = Math.round(performance.now() - emailStart);

      const typeLabel = result.type.padEnd(10);
      const catLabel = result.category.padEnd(14);
      console.log(
        `${label} ✓  ${elapsed}ms — ${typeLabel} / ${result.priority} / ${catLabel} (confidence: ${result.confidence.toFixed(2)})`
      );
      logLines.push(`[OK] ${filename} — ${elapsed}ms — ${result.type}/${result.priority}/${result.category}`);

      rows.push({
        email_id: emailId,
        filename,
        provider: decision.provider,
        model: decision.modelVersion,
        pipeline_stage: STAGE,
        predicted_ticket_type: result.type,
        predicted_priority: result.priority,
        predicted_category: result.category,
        predicted_tone: result.tone,
        predicted_urgency: result.urgency,
        confidence: result.confidence,
        processing_tier: 0,
        processing_time_ms: elapsed,
        raw_reasoning: result.reasoning,
        error: '',
      });
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - emailStart);
      const message = err instanceof Error ? err.message : String(err);

      console.log(`${label} ✗  ERROR — ${message}`);
      logLines.push(`[ERR] ${filename} — ${elapsed}ms — ${message}`);

      rows.push({
        email_id: emailId,
        filename,
        provider: 'jev',
        model: provider.model,
        pipeline_stage: STAGE,
        predicted_ticket_type: '',
        predicted_priority: '',
        predicted_category: '',
        predicted_tone: '',
        predicted_urgency: '',
        confidence: '',
        processing_tier: '',
        processing_time_ms: elapsed,
        raw_reasoning: '',
        error: message,
      });

      errorCount++;
    }

    if (errorCount === idx && idx >= FAIL_FAST_THRESHOLD) {
      const abortMsg =
        `First ${idx} emails ALL failed — aborting run. The provider is ` +
        `systematically unreachable; fix that before re-running (see errors above).`;
      console.error('─'.repeat(44));
      console.error(`✗ ${abortMsg}`);
      logLines.push('', `ABORTED: ${abortMsg}`);
      await writeFile(LOG_FILE, logLines.join('\n') + '\n', 'utf-8');
      process.exit(1);
    }
  }

  console.log('─'.repeat(44));

  const totalDuration = Math.round(performance.now() - runStart);
  const successCount = total - errorCount;

  await writeFile(OUTPUT_CSV, writeCsv(rows, CSV_COLUMNS), 'utf-8');

  logLines.push('');
  logLines.push(`Completed: ${successCount}/${total} — ${errorCount} error(s)`);
  logLines.push(`Duration: ${formatDuration(totalDuration)}`);
  await writeFile(LOG_FILE, logLines.join('\n') + '\n', 'utf-8');

  const errorSuffix = errorCount > 0 ? ` — ${errorCount} error(s). See ${LOG_FILE}` : '';
  console.log(`Completed: ${successCount}/${total}${errorSuffix}`);
  console.log(`Output:    ${OUTPUT_CSV}`);
  console.log(`Log:       ${LOG_FILE}`);
  console.log(`Duration:  ${formatDuration(totalDuration)}`);
  console.log(`\nMetrics: bun run eval:metrics ${SLUG}`);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
