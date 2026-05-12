import React from "react";
import { Check } from "lucide-react";

interface WizardStepperProps {
  steps: string[];
  current: number;
}

export function WizardStepper({ steps, current }: WizardStepperProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: i < current ? "var(--accent)" : i === current ? "white" : "transparent",
                border: `1.5px solid ${i <= current ? "var(--accent)" : "var(--border)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: i < current ? "white" : i === current ? "var(--accent)" : "var(--text-tertiary)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {i < current ? <Check size={12} strokeWidth={3} color="white" /> : i + 1}
            </div>
            <span
              style={{
                fontSize: 13,
                color: i <= current ? "var(--text-primary)" : "var(--text-tertiary)",
                fontWeight: i === current ? 500 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 1,
                background: i < current ? "var(--accent)" : "var(--border)",
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
