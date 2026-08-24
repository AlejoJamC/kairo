import { describe, it, expect } from "bun:test";
import { buildMarkdown } from "./report-writer";
import type { EvalReport } from "./report-writer";
import type { FieldMetrics, BaselineMetrics } from "./metrics";

function fm(macro_f1: number, off = 0): FieldMetrics {
  return {
    macro_f1,
    macro_precision: macro_f1,
    macro_recall: macro_f1,
    per_label: {},
    off_rubric_labels: off > 0 ? ["prospect"] : [],
    off_rubric_predictions: off,
  };
}

function base(macro_f1: number): BaselineMetrics {
  return { majority_label: "support", macro_f1, accuracy: macro_f1 };
}

function report(easyF1: number, baselineF1: number, off = 0): EvalReport {
  const fields = { ticket_type: fm(easyF1, off), priority: fm(0.3), category: fm(0.4), tone: fm(0.3), urgency: fm(0.2) };
  const baselines = { ticket_type: base(baselineF1), priority: base(0.2), category: base(0.3), tone: base(0.3), urgency: base(0.2) };
  return {
    run_metadata: {
      generated_at: "2026-01-01T00:00:00.000Z",
      run_slug: "test-run",
      ground_truth_file: "gt.csv",
      pipeline_output_file: "out.csv",
      total_emails: 50,
      emails_evaluated: 50,
      emails_skipped_due_to_error: 0,
    },
    field_metrics: fields,
    baseline: baselines,
    confidence_calibration: [],
    spanish_failure_modes: {
      tone_inflation: {
        aggressive_or_frustrated_emails: 0,
        emails_with_inflated_priority: 0,
        tone_inflation_rate: 0,
      },
      difficulty_breakdown: {
        easy: { count: 44, ticket_type_f1: easyF1, ticket_type_baseline_f1: baselineF1 },
        ambiguous: { count: 5, ticket_type_f1: 0, ticket_type_baseline_f1: 0 },
        hard: { count: 1, ticket_type_f1: 0, ticket_type_baseline_f1: 0 },
      },
    },
    per_email_diff: [],
  };
}

// ---------------------------------------------------------------------------
// The verdict must treat the majority-class baseline as disqualifying. Without
// that rule a run scoring 0.85 over a 0.90 floor reads as GO while carrying no
// information about the email it read.
// ---------------------------------------------------------------------------

describe("go/no-go decision", () => {
  it("is NO-GO when the run does not beat the baseline, however high the score", () => {
    const md = buildMarkdown(report(0.85, 0.9));

    expect(md).toContain("does not beat baseline");
    expect(md).not.toContain("GO ✓");
  });

  it("is NO-GO on an exact tie with the baseline", () => {
    expect(buildMarkdown(report(0.5, 0.5))).toContain("does not beat baseline");
  });

  it("is GO above the threshold and above the baseline", () => {
    const md = buildMarkdown(report(0.85, 0.5));

    expect(md).toContain("GO ✓");
    expect(md).not.toContain("does not beat baseline");
  });

  it("is NEEDS WORK between the baseline and the threshold", () => {
    expect(buildMarkdown(report(0.65, 0.5))).toContain("NEEDS WORK");
  });

  it("is NO-GO below the threshold even when it beats the baseline", () => {
    const md = buildMarkdown(report(0.4, 0.3));

    expect(md).toContain("NO-GO");
    expect(md).not.toContain("does not beat baseline");
  });
});

describe("markdown report", () => {
  it("prints the baseline next to the verdict", () => {
    const md = buildMarkdown(report(0.48, 0.46));

    expect(md).toContain("Majority-class baseline");
    expect(md).toContain("`support`");
  });

  it("shows baseline and off-rubric columns in the field table", () => {
    const md = buildMarkdown(report(0.48, 0.46, 5));

    expect(md).toContain("| Field ");
    expect(md).toContain("Baseline");
    expect(md).toContain("vs Baseline");
    expect(md).toContain("Off-rubric");
  });

  it("shows a negative delta when the run is under the floor", () => {
    expect(buildMarkdown(report(0.4, 0.6))).toContain("-0.20");
  });
});
