import type { TelemetryData } from "@/types";

interface TelemetryOverviewProps {
  data: TelemetryData;
}

export function TelemetryOverview({ data }: TelemetryOverviewProps) {
  return (
    <div style={{ borderRadius: 10, border: "1px solid var(--k-border)", background: "white", boxShadow: "0 1px 2px rgba(9,9,11,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--k-border-subtle)", padding: "10px 16px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", margin: 0 }}>
          Telemetry Overview
        </h3>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 24px", padding: "12px 16px" }}>
        <span style={{ fontSize: 13, color: "var(--k-text-secondary)" }}>
          Recent Runs:{" "}
          <span style={{ fontWeight: 600, color: "#C2410C" }}>
            {data.failures} Failures
          </span>
        </span>
        <span style={{ width: 1, height: 14, background: "var(--k-border)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "var(--k-text-secondary)" }}>
          Last Error:{" "}
          <span style={{ fontWeight: 600, color: "var(--k-text-primary)" }}>
            {data.lastError}
          </span>
        </span>
        <span style={{ width: 1, height: 14, background: "var(--k-border)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "var(--k-text-secondary)" }}>
          Last Run:{" "}
          <span style={{ fontWeight: 500, color: "var(--k-text-primary)" }}>
            {data.lastRunStatus}
          </span>{" "}
          <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 12, color: "var(--k-text-tertiary)" }}>
            {data.lastRunTime}
          </span>
        </span>
      </div>
    </div>
  );
}
