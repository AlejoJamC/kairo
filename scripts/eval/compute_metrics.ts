import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { computeFieldMetrics, computeBaseline } from './lib/metrics';
import { computeCalibration } from './lib/calibration';
import { computeAgreement } from './lib/agreement';
import type { FieldAgreement } from './lib/agreement';
import type { CalibrationEntry } from './lib/calibration';
import { computeToneInflation, computeDifficultyBreakdown, DIFFICULTY_LEVELS } from './lib/spanish-analysis';
import type { AnalysisRow } from './lib/spanish-analysis';
import { writeReports } from './lib/report-writer';
import type { EvalReport, PerEmailDiff, FieldDiff } from './lib/report-writer';
import { resolveRunLabel } from './lib/run-label';
import { resolveCorpus } from './lib/corpus';
import { PIPELINE_OUTPUT } from './lib/run-files';
// The eval validates against the same enums the pipeline emits — one source
import {
  TICKET_TYPE, PRIORITY, CATEGORY, TONE, URGENCY,
} from '../../packages/intelligence/src/index';

// ─── Paths ───────────────────────────────────────────────────────────────────

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;

// The corpus decides both halves at once: the labels and where the predictions
// for those same emails were written. Selecting them separately would let a run
// be scored against another corpus's ground truth.
const CORPUS = resolveCorpus();

// Metrics run against ONE model's pipeline output, resolved from the same
// env vars the pipeline run used (or pass the run directory name as argv[2],
// e.g. `bun run eval:metrics ollama-granite4.1-3b`). Reports land next to
// the pipeline output they measure — runs never share or overwrite files.
const RUN_SLUG = process.argv[2] ?? resolveRunLabel().slug;
const OUTPUT_DIR = join(SCRIPT_DIR, 'data/output', CORPUS.outputSubdir, RUN_SLUG);

const GT_FILE = join(SCRIPT_DIR, CORPUS.groundTruth);
const PIPELINE_FILE = join(OUTPUT_DIR, PIPELINE_OUTPUT);
const JSON_OUT = join(OUTPUT_DIR, 'eval_report.json');
const MD_OUT = join(OUTPUT_DIR, 'eval_report.md');

// ─── CSV parser (RFC 4180 state machine — no external deps) ─────────────────

type CsvRow = Record<string, string>;

interface CsvParseResult {
  headers: string[];
  rows: CsvRow[];
}

export function parseCsv(content: string): CsvParseResult {
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

// ─── Ground-truth adapter (KAI-93) ──────────────────────────────────────────
// `ground_truth_50.csv` is the raw two-annotator comparison sheet from KAI-102.
// Its label values are already canonical, so nothing is translated here. What
// the adapter still does is structural:
//   - rename the Spanish consensus columns to the canonical field names
//   - drop Excel-export ghost rows with an empty email_id
// Values pass through verbatim and are checked against the same enums the
// pipeline emits. A value outside them is reported, never silently coerced —
// coercion is how a business decision ends up buried in scoring code.

// ─── Sheet schemas ───────────────────────────────────────────────────────────
// Two annotator sheets exist and they name their columns differently. The
// original grew a column at a time and ended up half in Spanish; anything
// written from now on is in English like the rest of the repo.
//
// They are not interchangeable, and one collision makes that dangerous:
// `alexandra_tone` exists in both. In the legacy sheet it is the original
// four-class pass, annotated before the insistence rule was written down, on
// which the two annotators agreed 12% of the time. In an English sheet it is
// the live pass. Reading one as the other would score a run against labels
// nobody stands behind, and nothing downstream could tell.
//
// So detection keys on the consensus column for `ticket_type`, whose two
// spellings cannot both be right, and a sheet carrying both is refused rather
// than guessed at.

interface SheetSchema {
  name: string;
  /** Canonical field -> the column holding the resolved label. */
  final: Record<string, string>;
  /** Canonical field -> the two annotators' own columns. */
  annotators: Record<string, [string, string]>;
}

const ENGLISH_SHEET: SheetSchema = {
  name: 'english',
  final: {
    ticket_type: 'ticket_type_final',
    priority: 'priority_final',
    category: 'category_final',
    tone: 'tone_final',
    urgency: 'urgency_final',
    difficulty: 'difficulty_final',
  },
  annotators: {
    ticket_type: ['alexandra_ticket_type', 'alejandro_ticket_type'],
    priority: ['alexandra_priority', 'alejandro_priority'],
    category: ['alexandra_category', 'alejandro_category'],
    tone: ['alexandra_tone', 'alejandro_tone'],
    urgency: ['alexandra_urgency', 'alejandro_urgency'],
    difficulty: ['alexandra_difficulty', 'alejandro_difficulty'],
  },
};

const LEGACY_SHEET: SheetSchema = {
  name: 'legacy (mixed es/en)',
  final: {
    ticket_type: 'tipo_ticket_final',
    priority: 'prioridad_final',
    category: 'categoria_final',
    // The v1.3.0 pass, and only it. The sheet also carries the original
    // four-class pass and an intermediate binary one; neither describes a label
    // anything reads.
    tone: 'tono_final_v130',
    urgency: 'urgencia_final',
    difficulty: 'difficulty_final',
  },
  annotators: {
    ticket_type: ['alexandra_ticket_type', 'alejandro_ticket_type'],
    priority: ['alexandra_priority', 'alejandro_priority'],
    category: ['alexandra_category', 'alejandro_category'],
    tone: ['alexandra_tono_v130', 'alejandro_tono_v130'],
    urgency: ['alexandra_urgency', 'alejandro_urgency'],
    difficulty: ['alexandra_dificultad', 'alejandro_dificultad'],
  },
};

/** The schema a sheet is written in, or undefined when it is already canonical. */
export function detectSheet(headers: string[]): SheetSchema | undefined {
  const english = headers.includes(ENGLISH_SHEET.final['ticket_type']!);
  const legacy = headers.includes(LEGACY_SHEET.final['ticket_type']!);
  if (english && legacy) {
    throw new Error(
      'Ground truth carries both sheet schemas. `alexandra_tone` means a ' +
      'different pass in each, so which one to read cannot be inferred. Keep one.',
    );
  }
  if (english) return ENGLISH_SHEET;
  if (legacy) return LEGACY_SHEET;
  return undefined;
}

const CANONICAL_GT_HEADERS = [
  'email_id', 'ticket_type', 'priority', 'category', 'tone', 'urgency', 'difficulty',
];

const CANONICAL_VALUES: Record<string, readonly string[]> = {
  ticket_type: TICKET_TYPE,
  priority: PRIORITY,
  category: CATEGORY,
  tone: TONE,
  urgency: URGENCY,
  difficulty: DIFFICULTY_LEVELS,
};

// "field: value" → occurrences, reported after adaptation so nothing outside
// the enum passes unnoticed
const nonCanonicalGtValues = new Map<string, number>();

function gtValue(field: string, raw: string): string {
  const value = raw.trim();
  if (value === '') return '';
  const allowed = CANONICAL_VALUES[field];
  if (allowed && !allowed.includes(value)) {
    const key = `${field}: "${value}"`;
    nonCanonicalGtValues.set(key, (nonCanonicalGtValues.get(key) ?? 0) + 1);
  }
  return value;
}

// '001' and '1' must join to the same row
export function canonicalEmailId(raw: string): string {
  return raw.trim().replace(/^0+(?=\d)/, '');
}

export function adaptGroundTruth(parsed: CsvParseResult): CsvParseResult {
  // Already-canonical files pass through untouched
  const sheet = detectSheet(parsed.headers);
  if (!sheet) return parsed;

  // A missing consensus column would leave every row's value empty and the
  // field would report an F1 computed from nothing, silently. Say so instead.
  for (const [field, column] of Object.entries(sheet.final)) {
    if (!parsed.headers.includes(column)) {
      console.warn(
        `⚠  Ground truth has no "${column}" column — ${field} metrics will be empty.`,
      );
    }
  }

  const rows: CsvRow[] = [];
  for (const r of parsed.rows) {
    const id = canonicalEmailId(r['email_id'] ?? '');
    if (!id) continue; // Excel-export ghost row
    const row: CsvRow = { email_id: id };
    for (const [field, column] of Object.entries(sheet.final)) {
      row[field] = gtValue(field, r[column] ?? '');
    }
    rows.push(row);
  }

  return { headers: [...CANONICAL_GT_HEADERS], rows };
}

// ─── Agreement between the two annotators ───────────────────────────────────

/**
 * Agreement per field, read straight off the raw annotator sheet, using the
 * column names of whichever schema that sheet is written in.
 *
 * `difficulty` is in here although it is not a classifier field: the verdict is
 * macro F1 over the emails both annotators called easy, so how well they agree
 * on that decides which subset the headline number is measured over.
 *
 * Undefined when the sheet carries no annotator columns at all -- an
 * already-canonical ground truth, or another tenant's corpus. Absent is the
 * honest answer there; a zero would read as "they never agreed".
 */
export function computeAnnotatorAgreement(
  parsed: CsvParseResult,
): Record<string, FieldAgreement> | undefined {
  const sheet = detectSheet(parsed.headers);
  if (!sheet) return undefined;

  const present = Object.entries(sheet.annotators).filter(
    ([, [a, b]]) => parsed.headers.includes(a) && parsed.headers.includes(b),
  );
  if (present.length === 0) return undefined;

  const out: Record<string, FieldAgreement> = {};
  for (const [field, [colA, colB]] of present) {
    out[field] = computeAgreement(
      parsed.rows.map((r) => r[colA] ?? ''),
      parsed.rows.map((r) => r[colB] ?? ''),
    );
  }
  return out;
}

export function reportNonCanonicalGtValues(): void {
  if (nonCanonicalGtValues.size === 0) return;
  console.warn('⚠  Ground-truth values outside the pipeline enums (used as-is):');
  for (const [key, count] of nonCanonicalGtValues) {
    console.warn(`     ${key} × ${count}`);
  }
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
        `Expected the output of a pipeline run for "${RUN_SLUG}".\n` +
        'Run `bun run eval:pipeline` with the same INTELLIGENCE_PROVIDER / model\n' +
        'env vars, or pass the run directory name: bun run eval:metrics <run-slug>',
    );
    process.exit(1);
  }

  // ── 2. Read and parse CSVs ────────────────────────────────────────────────
  const gtRaw = await readFile(GT_FILE, 'utf-8');
  const pipelineRaw = await readFile(PIPELINE_FILE, 'utf-8');

  const gtParsed = parseCsv(gtRaw);
  const pipeline = parseCsv(pipelineRaw);

  const gt = adaptGroundTruth(gtParsed);
  if (gt !== gtParsed) {
    console.log(
      `GT adapter: raw annotator sheet detected → normalized in memory ` +
        `(${gt.rows.length} rows kept of ${gtParsed.rows.length} parsed)`,
    );
  }
  reportNonCanonicalGtValues();

  // '001' (pipeline) and '1' (ground truth) must join to the same email
  for (const row of pipeline.rows) {
    row['email_id'] = canonicalEmailId(row['email_id'] ?? '');
  }

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
    PIPELINE_OUTPUT,
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

  // Run identity: prefer what the output CSV itself recorded (real
  // provenance, one row per LLM response); fall back to the directory name
  // for CSVs produced before the provider/model columns existed
  const runProvider = pipeline.rows.find((r) => r['provider'])?.['provider'];
  const runModel = pipeline.rows.find((r) => r['model'])?.['model'];

  console.log('Kairo Eval Metrics — KAI-97');
  console.log(`Run:              ${runProvider ?? '?'} / ${runModel ?? '?'} (${RUN_SLUG})`);
  console.log(`Corpus:           ${CORPUS.id}`);
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

  // ── 5. Agreement between the two annotators ───────────────────────────────
  // Computed from the sheet rather than read from a hand-written file. It is a
  // property of the ground truth, and it qualifies every F1 below it: a field
  // the annotators do not reproduce has no stable target to score against.
  const annotatorAgreement = computeAnnotatorAgreement(gtParsed);
  if (annotatorAgreement) {
    console.log('Annotator agreement (raw, and above chance):');
    for (const [field, a] of Object.entries(annotatorAgreement)) {
      console.log(
        `  ${field.padEnd(14)} ${(a.observed * 100).toFixed(0).padStart(3)}%` +
        `   kappa ${a.kappa >= 0 ? '+' : ''}${a.kappa.toFixed(3)}   n=${a.n}`,
      );
    }
    console.log('─'.repeat(44));
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
  const baselines: Record<string, ReturnType<typeof computeBaseline>> = {};

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

    const metrics = computeFieldMetrics(truths, predictions, CANONICAL_VALUES[key]);
    const baseline = computeBaseline(truths);
    fieldMetrics[key] = metrics;
    baselines[key] = baseline;

    const delta = metrics.macro_f1 - baseline.macro_f1;
    const flag = delta > 0 ? '' : '  ← does not beat baseline';
    console.log(
      `  ${key.padEnd(14)} macro F1: ${metrics.macro_f1.toFixed(2)}` +
      `   baseline: ${baseline.macro_f1.toFixed(2)} (${baseline.majority_label})` +
      `   ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${flag}`,
    );
    // Two different things, deliberately reported apart. The first is a gap in
    // the corpus: a class the rubric allows but this corpus never exercises.
    // The second is a defect in the model: a value the prompt never offered.
    if (metrics.off_ground_truth_predictions > 0) {
      console.log(
        `  ${' '.repeat(14)} off-ground-truth: ${metrics.off_ground_truth_predictions} prediction(s) ` +
        `on ${metrics.off_ground_truth_labels.join(', ')} — allowed by the rubric, absent from ` +
        `this corpus. No F1 of their own, but still counted as false negatives`,
      );
    }
    if (metrics.off_contract_predictions > 0) {
      console.log(
        `  ${' '.repeat(14)} ⚠ off-contract: ${metrics.off_contract_predictions} prediction(s) ` +
        `on ${metrics.off_contract_labels.join(', ')} — outside the enum the model was given`,
      );
    }
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
      run_slug: RUN_SLUG,
      ...(runProvider ? { provider: runProvider } : {}),
      ...(runModel ? { model: runModel } : {}),
      ground_truth_file: GT_FILE,
      pipeline_output_file: PIPELINE_FILE,
      total_emails: total,
      emails_evaluated: evaluated.length,
      emails_skipped_due_to_error: skipped.length,
      ...(annotatorAgreement ? { annotator_agreement: annotatorAgreement } : {}),
    },
    field_metrics: {
      ticket_type: fieldMetrics['ticket_type']!,
      priority: fieldMetrics['priority']!,
      category: fieldMetrics['category']!,
      tone: fieldMetrics['tone']!,
      urgency: fieldMetrics['urgency']!,
    },
    baseline: {
      ticket_type: baselines['ticket_type']!,
      priority: baselines['priority']!,
      category: baselines['category']!,
      tone: baselines['tone']!,
      urgency: baselines['urgency']!,
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
  const easyBaseF1 = difficultyBreakdown.easy.ticket_type_baseline_f1;
  let decision: string;
  // A run that does not beat a classifier ignoring the email is disqualified
  // regardless of its absolute score
  if (easyF1 <= easyBaseF1) decision = 'NO-GO ✗ (does not beat baseline)';
  else if (easyF1 >= 0.8) decision = 'GO ✓';
  else if (easyF1 >= 0.6) decision = 'NEEDS WORK ⚠';
  else decision = 'NO-GO ✗';

  console.log(
    `DECISION: ticket_type F1 on easy emails = ${easyF1.toFixed(2)} ` +
    `(baseline ${easyBaseF1.toFixed(2)}) → ${decision}`,
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

// Only execute when run directly — the exports above are importable for tests
if (import.meta.main) {
  run();
}
