import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { computeFieldMetrics } from './lib/metrics';
import { computeCalibration } from './lib/calibration';
import type { CalibrationEntry } from './lib/calibration';
import { computeToneInflation, computeDifficultyBreakdown } from './lib/spanish-analysis';
import type { AnalysisRow } from './lib/spanish-analysis';
import { writeReports } from './lib/report-writer';
import type { EvalReport, PerEmailDiff, FieldDiff } from './lib/report-writer';

// ─── Paths ───────────────────────────────────────────────────────────────────

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const INPUT_DIR = join(SCRIPT_DIR, 'data/input');
const OUTPUT_DIR = join(SCRIPT_DIR, 'data/output');

const GT_FILE = join(INPUT_DIR, 'ground_truth_50.csv');
const PIPELINE_FILE = join(OUTPUT_DIR, 'pipeline_output_50.csv');
const META_FILE = join(INPUT_DIR, '_meta.json');
const JSON_OUT = join(OUTPUT_DIR, 'eval_report.json');
const MD_OUT = join(OUTPUT_DIR, 'eval_report.md');

// ─── CSV parser (RFC 4180 state machine — no external deps) ─────────────────

type CsvRow = Record<string, string>;

interface CsvParseResult {
  headers: string[];
  rows: CsvRow[];
}

function parseCsv(content: string): CsvParseResult {
  // Normalise line endings
  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const cells: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell);
        currentCell = '';
        // Skip blank lines
        if (currentRow.some((c) => c !== '')) {
          cells.push(currentRow);
        }
        currentRow = [];
      } else {
        currentCell += ch;
      }
    }
  }

  // Flush last cell/row
  currentRow.push(currentCell);
  if (currentRow.some((c) => c !== '')) {
    cells.push(currentRow);
  }

  if (cells.length === 0) return { headers: [], rows: [] };

  const headers = cells[0]!.map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let r = 1; r < cells.length; r++) {
    const rowCells = cells[r]!;
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (rowCells[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

// ─── Guards ──────────────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function verifyHeaders(
  actual: string[],
  expected: string[],
  label: string,
): void {
  const missing = expected.filter((h) => !actual.includes(h));
  if (missing.length > 0) {
    console.warn(
      `⚠  ${label}: expected columns not found: ${missing.join(', ')}. ` +
        'Using actual column names from file.',
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── 1. Check input files exist ────────────────────────────────────────────
  if (!(await fileExists(GT_FILE))) {
    console.error(
      `ERROR: Ground truth file not found:\n  ${GT_FILE}\n\n` +
        'Run KAI-102 first to produce this file.',
    );
    process.exit(1);
  }
  if (!(await fileExists(PIPELINE_FILE))) {
    console.error(
      `ERROR: Pipeline output file not found:\n  ${PIPELINE_FILE}\n\n` +
        'Run KAI-106 first: bun run eval:pipeline',
    );
    process.exit(1);
  }

  // ── 2. Read and parse CSVs ────────────────────────────────────────────────
  const gtRaw = await readFile(GT_FILE, 'utf-8');
  const pipelineRaw = await readFile(PIPELINE_FILE, 'utf-8');

  const gt = parseCsv(gtRaw);
  const pipeline = parseCsv(pipelineRaw);

  // Verify headers match expected schema (warn but don't fail)
  verifyHeaders(
    gt.headers,
    ['email_id', 'ticket_type', 'priority', 'category', 'tone', 'urgency', 'difficulty'],
    'ground_truth_50.csv',
  );
  verifyHeaders(
    pipeline.headers,
    ['email_id', 'predicted_ticket_type', 'predicted_priority', 'predicted_category',
     'predicted_tone', 'predicted_urgency', 'confidence', 'error'],
    'pipeline_output_50.csv',
  );

  // ── 3. Join on email_id ───────────────────────────────────────────────────
  const gtMap = new Map<string, CsvRow>();
  for (const row of gt.rows) {
    if (row['email_id']) gtMap.set(row['email_id'], row);
  }

  const pipelineMap = new Map<string, CsvRow>();
  for (const row of pipeline.rows) {
    if (row['email_id']) pipelineMap.set(row['email_id'], row);
  }

  // All email IDs present in both files
  const allIds = [...new Set([...gtMap.keys(), ...pipelineMap.keys()])].sort();
  const total = allIds.length;

  console.log('Kairo Eval Metrics — KAI-97');
  console.log(`Ground truth:     ${GT_FILE} (${gt.rows.length} rows)`);
  console.log(`Pipeline output:  ${PIPELINE_FILE} (${pipeline.rows.length} rows)`);

  // ── 4. Split into evaluated vs skipped ───────────────────────────────────
  const evaluated: CsvRow[] = [];
  const skipped: CsvRow[] = [];

  for (const id of allIds) {
    const pRow = pipelineMap.get(id);
    if (!pRow) continue; // no pipeline output for this id
    if (pRow['error'] && pRow['error'].length > 0) {
      skipped.push(pRow);
    } else {
      evaluated.push(pRow);
    }
  }

  console.log(`Emails evaluated: ${evaluated.length} (${skipped.length} skipped — errors)`);
  console.log('─'.repeat(44));

  // ── 5. Read optional _meta.json ───────────────────────────────────────────
  let interAnnotatorAgreement: number | undefined;
  if (await fileExists(META_FILE)) {
    try {
      const metaContent = await readFile(META_FILE, 'utf-8');
      const meta = JSON.parse(metaContent) as Record<string, unknown>;
      if (typeof meta['inter_annotator_agreement'] === 'number') {
        interAnnotatorAgreement = meta['inter_annotator_agreement'];
      }
    } catch {
      // Silently skip malformed meta file
    }
  }

  // ── 6. Compute field metrics ──────────────────────────────────────────────
  console.log('Computing F1 scores...');

  const fields: Array<{
    key: string;
    gtCol: string;
    predCol: string;
  }> = [
    { key: 'ticket_type', gtCol: 'ticket_type', predCol: 'predicted_ticket_type' },
    { key: 'priority', gtCol: 'priority', predCol: 'predicted_priority' },
    { key: 'category', gtCol: 'category', predCol: 'predicted_category' },
    { key: 'tone', gtCol: 'tone', predCol: 'predicted_tone' },
    { key: 'urgency', gtCol: 'urgency', predCol: 'predicted_urgency' },
  ];

  const fieldMetrics: Record<string, ReturnType<typeof computeFieldMetrics>> = {};

  for (const { key, gtCol, predCol } of fields) {
    const truths: string[] = [];
    const predictions: string[] = [];

    for (const pRow of evaluated) {
      const id = pRow['email_id']!;
      const gtRow = gtMap.get(id);
      if (!gtRow) continue;
      truths.push(gtRow[gtCol] ?? '');
      predictions.push(pRow[predCol] ?? '');
    }

    const metrics = computeFieldMetrics(truths, predictions);
    fieldMetrics[key] = metrics;
    console.log(`  ${key.padEnd(14)} macro F1: ${metrics.macro_f1.toFixed(2)}`);
  }

  // ── 7. Confidence calibration ─────────────────────────────────────────────
  console.log('Computing confidence calibration...');

  const calibrationEntries: CalibrationEntry[] = [];
  for (const pRow of evaluated) {
    const id = pRow['email_id']!;
    const gtRow = gtMap.get(id);
    if (!gtRow) continue;
    const confidence = parseFloat(pRow['confidence'] ?? '0');
    calibrationEntries.push({
      confidence: isNaN(confidence) ? 0 : confidence,
      predictedType: pRow['predicted_ticket_type'] ?? '',
      trueType: gtRow['ticket_type'] ?? '',
    });
  }

  const calibration = computeCalibration(calibrationEntries);
  for (const band of calibration) {
    const acc = `${(band.actual_accuracy * 100).toFixed(0)}%`;
    console.log(
      `  ${band.range}: ${String(band.count).padStart(2)} emails → ${acc} accurate`,
    );
  }

  // ── 8. Spanish failure modes ──────────────────────────────────────────────
  console.log('Analyzing Spanish failure modes...');

  const analysisRows: AnalysisRow[] = [];
  for (const pRow of evaluated) {
    const id = pRow['email_id']!;
    const gtRow = gtMap.get(id);
    if (!gtRow) continue;
    analysisRows.push({
      gtTone: gtRow['tone'] ?? '',
      gtPriority: gtRow['priority'] ?? '',
      predictedPriority: pRow['predicted_priority'] ?? '',
      gtDifficulty: gtRow['difficulty'] ?? '',
      gtTicketType: gtRow['ticket_type'] ?? '',
      predictedTicketType: pRow['predicted_ticket_type'] ?? '',
    });
  }

  const toneInflation = computeToneInflation(analysisRows);
  const difficultyBreakdown = computeDifficultyBreakdown(analysisRows);

  const tiRate = (toneInflation.tone_inflation_rate * 100).toFixed(0);
  console.log(
    `  Tone inflation rate: ${tiRate}% (${toneInflation.emails_with_inflated_priority}/` +
      `${toneInflation.aggressive_or_frustrated_emails} aggressive emails got inflated priority)`,
  );
  for (const [level, entry] of Object.entries(difficultyBreakdown)) {
    console.log(
      `  ${(level.charAt(0).toUpperCase() + level.slice(1)).padEnd(12)} F1: ` +
        `${entry.ticket_type_f1.toFixed(2)}`,
    );
  }

  // ── 9. Build per-email diff ───────────────────────────────────────────────
  const perEmailDiff: PerEmailDiff[] = [];

  for (const id of allIds) {
    const gtRow = gtMap.get(id);
    const pRow = pipelineMap.get(id);

    if (!gtRow || !pRow) continue;

    const confidence = parseFloat(pRow['confidence'] ?? '0');

    const makeDiff = (gtCol: string, predCol: string): FieldDiff => {
      const truth = gtRow[gtCol] ?? '';
      const predicted = pRow[predCol] ?? '';
      return { truth, predicted, match: truth === predicted };
    };

    perEmailDiff.push({
      email_id: id,
      difficulty: gtRow['difficulty'] ?? '',
      confidence: isNaN(confidence) ? 0 : confidence,
      ticket_type: makeDiff('ticket_type', 'predicted_ticket_type'),
      priority: makeDiff('priority', 'predicted_priority'),
      category: makeDiff('category', 'predicted_category'),
      tone: makeDiff('tone', 'predicted_tone'),
      urgency: makeDiff('urgency', 'predicted_urgency'),
      error: pRow['error'] ?? '',
    });
  }

  // ── 10. Assemble and write report ─────────────────────────────────────────
  const report: EvalReport = {
    run_metadata: {
      generated_at: new Date().toISOString(),
      ground_truth_file: GT_FILE,
      pipeline_output_file: PIPELINE_FILE,
      total_emails: total,
      emails_evaluated: evaluated.length,
      emails_skipped_due_to_error: skipped.length,
      ...(interAnnotatorAgreement !== undefined ? { inter_annotator_agreement: interAnnotatorAgreement } : {}),
    },
    field_metrics: {
      ticket_type: fieldMetrics['ticket_type']!,
      priority: fieldMetrics['priority']!,
      category: fieldMetrics['category']!,
      tone: fieldMetrics['tone']!,
      urgency: fieldMetrics['urgency']!,
    },
    confidence_calibration: calibration,
    spanish_failure_modes: {
      tone_inflation: toneInflation,
      difficulty_breakdown: difficultyBreakdown,
    },
    per_email_diff: perEmailDiff,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeReports(report, JSON_OUT, MD_OUT);

  // ── 11. Summary ───────────────────────────────────────────────────────────
  console.log('─'.repeat(44));

  const easyF1 = difficultyBreakdown.easy.ticket_type_f1;
  let decision: string;
  if (easyF1 >= 0.8) decision = 'GO ✓';
  else if (easyF1 >= 0.6) decision = 'NEEDS WORK ⚠';
  else decision = 'NO-GO ✗';

  console.log(
    `DECISION: ticket_type F1 on easy emails = ${easyF1.toFixed(2)} → ${decision}`,
  );
  console.log('');
  console.log('Reports written:');
  console.log(`  ${JSON_OUT}`);
  console.log(`  ${MD_OUT}`);
}

// Write completion summary to a log file as well
async function run(): Promise<void> {
  const logPath = join(OUTPUT_DIR, 'eval_metrics_run.log');
  const logLines: string[] = [`[${new Date().toISOString()}] eval:metrics run started`];

  try {
    await main();
    logLines.push('Status: completed');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logLines.push(`Status: FAILED — ${msg}`);
    console.error('Fatal error:', msg);
    process.exit(1);
  } finally {
    try {
      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(logPath, logLines.join('\n') + '\n', 'utf-8');
    } catch {
      // Don't fail the whole script because of log write error
    }
  }
}

run();
