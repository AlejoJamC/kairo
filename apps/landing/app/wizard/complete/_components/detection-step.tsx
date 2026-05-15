"use client";

import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useClassificationProgress, type ClassificationProgress } from "@/lib/hooks/useClassificationProgress";
import { useTranslation } from "@/lib/i18n";

interface DetectionStepProps {
  onContinue: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  technical:      "var(--danger)",
  billing:        "var(--accent)",
  account:        "var(--warning)",
  general:        "var(--success)",
  not_applicable: "var(--text-tertiary)",
};

function MetricCard({
  label, value, color, ariaLabel,
}: {
  label: string;
  value: number;
  color: string;
  ariaLabel: string;
}) {
  return (
    <div style={{ background: "white", padding: "20px 18px" }}>
      <div
        style={{
          fontSize: 11, fontFamily: "var(--font-mono)",
          color: "var(--text-tertiary)", textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      <div
        aria-label={ariaLabel}
        style={{
          fontSize: 32, fontWeight: 600, color,
          fontFamily: "var(--font-display)", letterSpacing: "-0.02em", marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CategoryPills({
  categories, labels,
}: {
  categories: ClassificationProgress["categories"];
  labels: Record<string, string>;
}) {
  const entries = Object.entries(categories) as Array<[keyof typeof categories, number]>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 28 }}>
      {entries.map(([key, count]) => (
        <span
          key={key}
          style={{
            padding: "4px 10px", fontSize: 12, borderRadius: 999,
            border: "1px solid var(--border)", background: "white",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: CATEGORY_COLORS[key], flexShrink: 0 }} />
          {labels[key] ?? key}
          <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{count}</span>
        </span>
      ))}
    </div>
  );
}

export function DetectionStep({ onContinue }: DetectionStepProps) {
  const { t } = useTranslation();
  const dt = t.wizard.detect;
  const { data, error, retry } = useClassificationProgress();

  // Two independent signals:
  //  - isStillScanning controls the live "scanning…" indicator + spinner. It
  //    stays true until the pipeline truly finishes (status === "complete").
  //  - canContinue controls whether the Continue button is enabled. It fires
  //    as soon as threshold_reached is true, while the scan keeps running.
  const isStillScanning = data?.status === "in_progress";
  const canContinue = data?.threshold_reached || data?.status === "complete" || !!error;

  const categoryLabels: Record<string, string> = {
    technical:      dt.categoryTechnical,
    billing:        dt.categoryBilling,
    account:        dt.categoryAccount,
    general:        dt.categoryGeneral,
    not_applicable: dt.categoryNotApplicable,
  };

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <>
        <h1
          style={{
            fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em",
            margin: "0 0 12px", fontFamily: "var(--font-display)", color: "var(--text-primary)",
          }}
        >
          {dt.errorTitle}
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 28px" }}>
          {dt.errorBody}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={retry}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 18px", fontSize: 14, fontWeight: 500,
              background: "var(--border)", color: "var(--text-primary)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-input)",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <RefreshCw size={14} strokeWidth={2} />
            {dt.retry}
          </button>
          <button
            onClick={onContinue}
            style={{
              fontSize: 13, color: "var(--text-secondary)", background: "none",
              border: "none", cursor: "pointer", padding: "10px 12px", fontFamily: "inherit",
            }}
          >
            {dt.skip}
          </button>
        </div>
      </>
    );
  }

  // ── Loading or data state ──────────────────────────────────────────────────
  const isDone = data?.status === "complete";
  const title = isDone ? t.wizard.detectDoneTitle : t.wizard.detectScanningTitle;
  const description = isDone ? t.wizard.detectDoneNote : dt.loadingDescription;

  return (
    <>
      <h1
        style={{
          fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em",
          margin: "0 0 12px", fontFamily: "var(--font-display)", color: "var(--text-primary)",
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 28px" }}>
        {description}
      </p>

      {/* Metrics grid — responsive: 1 col on small screens, 3 on medium+ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 1, background: "var(--border-subtle)",
          border: "1px solid var(--border)", borderRadius: 10,
          overflow: "hidden", marginBottom: 24,
        }}
      >
        <MetricCard
          label={dt.metricTickets}
          value={data?.tickets_count ?? 0}
          color="var(--accent)"
          ariaLabel={`${dt.metricTickets}: ${data?.tickets_count ?? 0}`}
        />
        <MetricCard
          label={dt.metricThreads}
          value={data?.threads_count ?? 0}
          color="var(--success)"
          ariaLabel={`${dt.metricThreads}: ${data?.threads_count ?? 0}`}
        />
        <MetricCard
          label={dt.metricClients}
          value={data?.clients_count ?? 0}
          color="var(--warning)"
          ariaLabel={`${dt.metricClients}: ${data?.clients_count ?? 0}`}
        />
      </div>

      {/* Categories */}
      <div
        style={{
          marginBottom: 8, fontSize: 12, fontFamily: "var(--font-mono)",
          color: "var(--text-tertiary)", letterSpacing: "0.05em",
        }}
      >
        {dt.metricCategories}
      </div>

      {data ? (
        <CategoryPills categories={data.categories} labels={categoryLabels} />
      ) : (
        <div style={{ height: 28, marginBottom: 28 }} aria-live="polite" aria-label={dt.loadingDescription} />
      )}

      {/* Scanning indicator — visible while pipeline is still running, even after threshold */}
      {isStillScanning && (
        <div
          aria-live="polite"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)", marginBottom: 16,
          }}
        >
          <Loader2 size={11} className="animate-spin" />
          {dt.loadingDescription}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {/* "Configurar triage" — visually present, disabled per spec */}
        <button
          disabled
          aria-disabled="true"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", fontSize: 14, fontWeight: 500,
            background: "var(--border)", color: "var(--text-tertiary)",
            border: "none", borderRadius: "var(--radius-input)",
            cursor: "not-allowed", fontFamily: "inherit",
          }}
        >
          {dt.configureTriageDisabled}
        </button>

        <button
          onClick={onContinue}
          disabled={!canContinue}
          aria-disabled={!canContinue}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", fontSize: 14, fontWeight: 500,
            background: canContinue ? "var(--accent)" : "var(--border)",
            color: "white", border: "none", borderRadius: "var(--radius-input)",
            cursor: canContinue ? "pointer" : "not-allowed",
            transition: "background 0.12s ease", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { if (canContinue) e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { if (canContinue) e.currentTarget.style.background = "var(--accent)"; }}
        >
          {canContinue ? (
            <>{dt.continue} <ArrowRight size={14} strokeWidth={2} /></>
          ) : (
            <><Loader2 size={14} className="animate-spin" /> {t.wizard.detectScanningTitle}</>
          )}
        </button>
      </div>
    </>
  );
}
