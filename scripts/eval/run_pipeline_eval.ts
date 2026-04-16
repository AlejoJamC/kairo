import { join } from 'path';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { classifyEmail } from '@kairo/intelligence';
import { parseEml } from './lib/parse-eml';
import { writeCsv } from './lib/write-csv';

// Resolve paths relative to this file's directory
const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const INPUT_DIR = join(SCRIPT_DIR, 'data/input/eml');
const OUTPUT_DIR = join(SCRIPT_DIR, 'data/output');
const OUTPUT_CSV = join(OUTPUT_DIR, 'pipeline_output_50.csv');
const LOG_FILE = join(OUTPUT_DIR, 'pipeline_eval_run.log');

const TEMPERATURE = 0;

interface OutputRow {
  email_id: string;
  filename: string;
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

  console.log('Kairo Pipeline Eval — KAI-106');
  console.log(`Dataset: ${INPUT_DIR} (${total} files)`);
  console.log(`Temperature: ${TEMPERATURE} (enforced)`);
  console.log('─'.repeat(44));

  const rows: OutputRow[] = [];
  const logLines: string[] = [
    `[${new Date().toISOString()}] Kairo Pipeline Eval — KAI-106`,
    `Dataset: ${INPUT_DIR} (${total} files)`,
    `Temperature: ${TEMPERATURE}`,
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

      const result = await classifyEmail(
        { subject: parsed.subject, from: parsed.from, body: parsed.body },
        { temperature: TEMPERATURE }
      );

      const elapsed = Math.round(performance.now() - emailStart);

      const typeLabel = result.tipo.padEnd(10);
      const catLabel = result.categoria.padEnd(14);
      console.log(
        `${label} ✓  ${elapsed}ms — ${typeLabel} / ${result.prioridad} / ${catLabel} (confidence: ${result.confianza.toFixed(2)})`
      );

      logLines.push(
        `[OK] ${filename} — ${elapsed}ms — ${result.tipo}/${result.prioridad}/${result.categoria}`
      );

      rows.push({
        email_id: emailId,
        filename,
        predicted_ticket_type: result.tipo,
        predicted_priority: result.prioridad,
        predicted_category: result.categoria,
        predicted_tone: result.sentimiento,
        predicted_urgency: '',
        confidence: result.confianza,
        processing_tier: 0,
        processing_time_ms: elapsed,
        raw_reasoning: result.razonamiento,
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
