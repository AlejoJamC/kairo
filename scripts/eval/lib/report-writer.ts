import type { FieldMetrics, BaselineMetrics } from './metrics';
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
    // Which provider/model produced the pipeline output being measured
    // (from the run directory + the output CSV's provider/model columns)
    run_slug: string;
    provider?: string;
    model?: string;
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
  /**
   * Majority-class baseline per field, computed from the ground truth alone.
   * A run that does not beat it is not a candidate, whatever its raw score.
   */
  baseline: {
    ticket_type: BaselineMetrics;
    priority: BaselineMetrics;
    category: BaselineMetrics;
    tone: BaselineMetrics;
    urgency: BaselineMetrics;
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

function goNoGo(easyF1: number, baselineF1: number): string {
  // Failing to beat a classifier that ignores the email is disqualifying on
  // its own — a high absolute score under that floor measures class imbalance,
  // not classification.
  if (easyF1 <= baselineF1) return 'NO-GO ✗ (does not beat baseline)';
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
  const easyBaseF1 = sfm.difficulty_breakdown.easy.ticket_type_baseline_f1;
  const decision = goNoGo(easyF1, easyBaseF1);

  const lines: string[] = [];

  // Header
  lines.push('# Kairo Pipeline Evaluation Report');
  lines.push(`Generated: ${meta.generated_at}`);
  lines.push(
    `Run: ${meta.provider ?? '?'} / ${meta.model ?? '?'} (\`${meta.run_slug}\`)`,
  );
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
      ['≤ baseline', 'Not a candidate — no information about the email.'],
    ],
  ));
  lines.push('');
  lines.push(`**ticket_type F1 on easy emails: ${pct(easyF1)} → ${decision}**`);
  lines.push(
    `Majority-class baseline on the same subset: **${pct(easyBaseF1)}** ` +
    `(always answering \`${report.baseline.ticket_type.majority_label}\`) — ` +
    `run is **${f2(easyF1 - easyBaseF1)}** against the floor.`,
  );
  lines.push('');

  // F1 table
  lines.push('## F1 Scores by Field');
  lines.push('');
  const fieldRows = (
    Object.entries(fm) as [string, FieldMetrics][]
  ).map(([field, m]) => {
    const base = report.baseline[field as keyof typeof report.baseline];
    return [
      field,
      f2(m.macro_f1),
      f2(base.macro_f1),
      f2(m.macro_f1 - base.macro_f1),
      f2(m.macro_precision),
      f2(m.macro_recall),
      String(m.off_ground_truth_predictions),
    ];
  });
  lines.push(mdTable(
    ['Field', 'Macro F1', 'Baseline', 'vs Baseline', 'Macro Precision', 'Macro Recall', 'Off-GT'],
    fieldRows,
  ));
  lines.push('');
  lines.push(
    '**Baseline** is a classifier that ignores the email and always answers the ' +
    "ground truth's most frequent class. A negative `vs Baseline` means the run " +
    'carries no information about the email it read.',
  );
  lines.push('');
  lines.push(
    '**Off-GT** counts predictions on a class the ground truth never uses. It is ' +
    'not a model defect — the class can be perfectly legal under the rubric and ' +
    'simply absent from this corpus. Those predictions get no F1 of their own, ' +
    'but they still count as false negatives against the true class. A high ' +
    'number here is a statement about the corpus, not about the model.',
  );
  lines.push('');

  // Off-contract is the real defect: a value the prompt never offered. It is
  // usually zero, and saying so out loud is the point — it is what proves the
  // schema-constrained decoding held for the whole run.
  const offContract = (Object.entries(fm) as [string, FieldMetrics][])
    .filter(([, m]) => m.off_contract_predictions > 0);
  if (offContract.length === 0) {
    lines.push(
      '**Off-contract: none.** Every prediction in this run is a value the ' +
      'classification enums allow.',
    );
  } else {
    lines.push(
      '**Off-contract** — predictions outside the enum the model was given. ' +
      'Unlike Off-GT, this *is* a model defect:',
    );
    lines.push('');
    for (const [field, m] of offContract) {
      lines.push(
        `- \`${field}\`: ${m.off_contract_predictions} prediction(s) on ` +
        `${m.off_contract_labels.map((l) => `\`${l}\``).join(', ')}`,
      );
    }
  }
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
      pct(d.ticket_type_baseline_f1),
    ],
  );
  lines.push(mdTable(
    ['Difficulty', '# Emails', 'ticket_type F1', 'Baseline'],
    diffRows,
  ));
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
