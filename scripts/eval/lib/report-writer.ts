import type { FieldMetrics } from './metrics';
import type { CalibrationBand } from './calibration';
import type { ToneInflationResult, DifficultyBreakdown, DifficultyEntry } from './spanish-analysis';

// ─── Output types ───────────────────────────────────────────────────────────

export interface FieldDiff {
  truth: string;
  predicted: string;
  match: boolean;
}

export interface PerEmailDiff {
  email_id: string;
  difficulty: string;
  confidence: number;
  ticket_type: FieldDiff;
  priority: FieldDiff;
  category: FieldDiff;
  tone: FieldDiff;
  urgency: FieldDiff;
  error: string;
}

export interface EvalReport {
  run_metadata: {
    generated_at: string;
    ground_truth_file: string;
    pipeline_output_file: string;
    total_emails: number;
    emails_evaluated: number;
    emails_skipped_due_to_error: number;
    inter_annotator_agreement?: number;
  };
  field_metrics: {
    ticket_type: FieldMetrics;
    priority: FieldMetrics;
    category: FieldMetrics;
    tone: FieldMetrics;
    urgency: FieldMetrics;
  };
  confidence_calibration: CalibrationBand[];
  spanish_failure_modes: {
    tone_inflation: ToneInflationResult;
    difficulty_breakdown: DifficultyBreakdown;
  };
  per_email_diff: PerEmailDiff[];
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function f2(n: number): string {
  return n.toFixed(2);
}

function mdTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const sep = widths.map((w) => '-'.repeat(w));
  const fmt = (row: string[]) =>
    '| ' + row.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' | ') + ' |';
  return [fmt(headers), fmt(sep), ...rows.map(fmt)].join('\n');
}

// ─── Go/No-Go decision ───────────────────────────────────────────────────────

function goNoGo(easyF1: number): string {
  if (easyF1 >= 0.8) return 'GO ✓';
  if (easyF1 >= 0.6) return 'NEEDS WORK ⚠';
  return 'NO-GO ✗';
}

// ─── Markdown builder ────────────────────────────────────────────────────────

function buildFieldSection(name: string, metrics: FieldMetrics): string {
  const lines: string[] = [];
  lines.push(`### ${name} — Per Label`);
  lines.push('');
  const rows = Object.entries(metrics.per_label).map(([label, m]) => [
    label,
    String(m.support),
    pct(m.precision),
    pct(m.recall),
    pct(m.f1),
  ]);
  lines.push(mdTable(['Label', 'Support', 'Precision', 'Recall', 'F1'], rows));
  lines.push('');
  return lines.join('\n');
}

export function buildMarkdown(report: EvalReport): string {
  const { run_metadata: meta, field_metrics: fm, confidence_calibration: cal,
    spanish_failure_modes: sfm, per_email_diff: diffs } = report;

  const easyF1 = sfm.difficulty_breakdown.easy.ticket_type_f1;
  const decision = goNoGo(easyF1);

  const lines: string[] = [];

  // Header
  lines.push('# Kairo Pipeline Evaluation Report');
  lines.push(`Generated: ${meta.generated_at}`);
  lines.push(
    `Dataset: ${meta.total_emails} emails — ${meta.emails_evaluated} evaluated, ` +
    `${meta.emails_skipped_due_to_error} skipped (errors)`,
  );
  if (meta.inter_annotator_agreement !== undefined) {
    lines.push(`Inter-annotator agreement: ${pct(meta.inter_annotator_agreement)}`);
  }
  lines.push('');

  // Go/No-Go
  lines.push('## Decision: Go / No-Go for Demo');
  lines.push('');
  lines.push(mdTable(
    ['Result on easy emails (ticket_type F1)', 'Interpretation'],
    [
      ['≥ 80%', 'Pipeline is showable to client'],
      ['60–79%', 'Real problem, needs adjustment before demo'],
      ['< 60%', 'Do not show. Identify where it fails and fix.'],
    ],
  ));
  lines.push('');
  lines.push(`**ticket_type F1 on easy emails: ${pct(easyF1)} → ${decision}**`);
  lines.push('');

  // F1 table
  lines.push('## F1 Scores by Field');
  lines.push('');
  const fieldRows = (
    Object.entries(fm) as [string, FieldMetrics][]
  ).map(([field, m]) => [
    field,
    f2(m.macro_f1),
    f2(m.macro_precision),
    f2(m.macro_recall),
  ]);
  lines.push(mdTable(['Field', 'Macro F1', 'Macro Precision', 'Macro Recall'], fieldRows));
  lines.push('');

  // Per-label tables
  for (const [field, metrics] of Object.entries(fm) as [string, FieldMetrics][]) {
    lines.push(buildFieldSection(field, metrics));
  }

  // Calibration
  lines.push('## Confidence Calibration');
  lines.push('');
  const calRows = cal.map((b) => [
    b.range,
    String(b.count),
    String(b.correct),
    pct(b.actual_accuracy),
  ]);
  lines.push(mdTable(['Confidence', '# Emails', '# Correct', 'Actual Accuracy'], calRows));
  lines.push('');
  lines.push(
    '**Interpretation:** If actual accuracy closely tracks confidence → scores are ' +
    'meaningful and can drive routing decisions. If they diverge → confidence is noise.',
  );
  lines.push('');

  // Spanish failure modes
  lines.push('## Spanish-Language Failure Modes');
  lines.push('');
  lines.push('### Tone Inflation');
  const ti = sfm.tone_inflation;
  lines.push(`- Emails with aggressive/frustrated tone: **${ti.aggressive_or_frustrated_emails}**`);
  lines.push(`- Of those, pipeline assigned higher priority than ground truth: **${ti.emails_with_inflated_priority}**`);
  lines.push(`- **Tone inflation rate: ${pct(ti.tone_inflation_rate)}**`);
  lines.push('');
  lines.push('### Accuracy by Difficulty');
  lines.push('');
  const diffRows = (Object.entries(sfm.difficulty_breakdown) as [string, DifficultyEntry][]).map(
    ([level, d]) => [
      level.charAt(0).toUpperCase() + level.slice(1),
      String(d.count),
      pct(d.ticket_type_f1),
    ],
  );
  lines.push(mdTable(['Difficulty', '# Emails', 'ticket_type F1'], diffRows));
  lines.push('');

  // Per-email diff — mismatches only
  lines.push('## Per-Email Diff (mismatches only)');
  lines.push('');
  const mismatchRows: string[][] = [];
  for (const d of diffs) {
    const fields: [string, FieldDiff][] = [
      ['ticket_type', d.ticket_type],
      ['priority', d.priority],
      ['category', d.category],
      ['tone', d.tone],
      ['urgency', d.urgency],
    ];
    for (const [field, fd] of fields) {
      if (!fd.match) {
        mismatchRows.push([
          d.email_id,
          d.difficulty,
          f2(d.confidence),
          field,
          fd.truth,
          fd.predicted,
          '✗',
        ]);
      }
    }
    if (d.error) {
      mismatchRows.push([d.email_id, d.difficulty, f2(d.confidence), 'error', '', d.error, '✗']);
    }
  }

  if (mismatchRows.length === 0) {
    lines.push('_No mismatches — perfect agreement._');
  } else {
    lines.push(
      mdTable(
        ['email_id', 'difficulty', 'confidence', 'field', 'truth', 'predicted', 'match'],
        mismatchRows,
      ),
    );
  }
  lines.push('');

  return lines.join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function writeReports(
  report: EvalReport,
  jsonPath: string,
  mdPath: string,
): Promise<void> {
  const { writeFile } = await import('fs/promises');
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  await writeFile(mdPath, buildMarkdown(report), 'utf-8');
}
