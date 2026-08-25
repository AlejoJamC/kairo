import { join } from 'path';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
// Relative import: scripts/eval is not a workspace package, so the
// `@kairo/intelligence` specifier does not resolve at runtime (the tsconfig
// `paths` alias only covers type-checking)
import { classifyEmailWithMeta } from '../../packages/intelligence/src/index';
import { supportsTemperature } from '../../packages/intelligence/src/providers/anthropic/completion';
import { parseEml } from './lib/parse-eml';
import { writeCsv } from './lib/write-csv';
import { resolveRunLabel } from './lib/run-label';

// Resolve paths relative to this file's directory
const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const INPUT_DIR = join(SCRIPT_DIR, 'data/input/eml');

// Each run writes into its own per-model directory so results from different
// providers/models never overwrite each other
const RUN = resolveRunLabel();
const OUTPUT_DIR = join(SCRIPT_DIR, 'data/output', RUN.slug);
const OUTPUT_CSV = join(OUTPUT_DIR, 'pipeline_output_50.csv');
const LOG_FILE = join(OUTPUT_DIR, 'pipeline_eval_run.log');

const TEMPERATURE = 0;

// If this many emails fail consecutively from the very start, the model is
// systematically incompatible (wrong format, model not pulled, provider
// down) — abort instead of burning 15 minutes producing 50 identical errors
const FAIL_FAST_THRESHOLD = 5;

interface OutputRow {
  email_id: string;
  filename: string;
  provider: string;
  model: string;
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
  'email_id',
  'filename',
  'provider',
  'model',
  'predicted_ticket_type',
  'predicted_priority',
  'predicted_category',
  'predicted_tone',
  'predicted_urgency',
  'confidence',
  'processing_tier',
  'processing_time_ms',
  'raw_reasoning',
  'error',
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
  await mkdir(OUTPUT_DIR, { recursive: true });

  const allFiles = await readdir(INPUT_DIR);
  const emlFiles = allFiles
    .filter((f: string) => f.endsWith('.eml'))
    .sort();

  const total = emlFiles.length;
  const padWidth = String(total).length;

  // Claude 5-line models (Fable/Mythos/Opus/Sonnet 5) reject `temperature`
  // outright — the completion provider omits it for them, so run-to-run
  // reproducibility for those runs relies on the model's own default
  // sampling, not on the enforced temperature=0 used for every other model.
  const temperatureEnforced = RUN.provider !== 'anthropic' || supportsTemperature(RUN.model);
  const temperatureLabel = temperatureEnforced
    ? `${TEMPERATURE} (enforced)`
    : `n/a — not sent (removed param on ${RUN.model}); reproducibility not guaranteed`;

  const contextLabel = RUN.withoutContext
    ? 'WITHHELD (ablation — recipients, thread depth and attachments sent as unavailable)'
    : 'full (recipients, thread depth, attachments)';

  console.log('Kairo Pipeline Eval — KAI-106');
  console.log(`Run: ${RUN.provider} / ${RUN.model} → ${OUTPUT_DIR}`);
  console.log(`Context: ${contextLabel}`);
  console.log(`Dataset: ${INPUT_DIR} (${total} files)`);
  console.log(`Temperature: ${temperatureLabel}`);
  console.log('─'.repeat(44));

  const rows: OutputRow[] = [];
  const logLines: string[] = [
    `[${new Date().toISOString()}] Kairo Pipeline Eval — KAI-106`,
    `Run: ${RUN.provider} / ${RUN.model}`,
    `Context: ${contextLabel}`,
    `Dataset: ${INPUT_DIR} (${total} files)`,
    `Temperature: ${temperatureLabel}`,
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

      // Ablation: withholding the fields is not a second prompt — the template
      // is identical and buildPrompt renders the gaps as unavailable, which is
      // exactly what production sends from the call sites that lack them
      const message = RUN.withoutContext
        ? { subject: parsed.subject, from: parsed.from, body: parsed.body }
        : {
            subject: parsed.subject,
            from: parsed.from,
            to: parsed.to,
            cc: parsed.cc,
            body: parsed.body,
            threadDepth: parsed.threadDepth,
            attachments: parsed.attachments,
          };

      const { result, meta } = await classifyEmailWithMeta(message, {
        temperature: TEMPERATURE,
      });

      const elapsed = Math.round(performance.now() - emailStart);

      const typeLabel = result.type.padEnd(10);
      const catLabel = result.category.padEnd(14);
      console.log(
        `${label} ✓  ${elapsed}ms — ${typeLabel} / ${result.priority} / ${catLabel} (confidence: ${result.confidence.toFixed(2)})`
      );

      logLines.push(
        `[OK] ${filename} — ${elapsed}ms — ${result.type}/${result.priority}/${result.category}`
      );

      rows.push({
        email_id: emailId,
        filename,
        provider: RUN.provider,
        model: meta.model,
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
        provider: RUN.provider,
        model: RUN.model,
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
        `First ${idx} emails ALL failed — aborting run. The model/provider is ` +
        `systematically incompatible; fix that before re-running (see errors above).`;
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

  const errorSuffix =
    errorCount > 0 ? ` — ${errorCount} error(s). See ${LOG_FILE}` : '';
  console.log(`Completed: ${successCount}/${total}${errorSuffix}`);
  console.log(`Output:    ${OUTPUT_CSV}`);
  console.log(`Log:       ${LOG_FILE}`);
  console.log(`Duration:  ${formatDuration(totalDuration)}`);
}

main().catch((err: unknown) => {
  console.error(
    'Fatal error:',
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
