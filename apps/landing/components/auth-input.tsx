import React from "react";

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  labelRight?: React.ReactNode;
  error?: string;
}

export function AuthInput({
  label,
  labelRight,
  error,
  id,
  ...props
}: AuthInputProps) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label
          htmlFor={id}
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </label>
        {labelRight}
      </div>
      <input
        id={id}
        style={{
          display: "block",
          width: "100%",
          padding: "11px 13px",
          fontSize: 14,
          border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
          borderRadius: "var(--radius-input)",
          outline: "none",
          background: "white",
          color: "var(--text-primary)",
          marginTop: 6,
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "var(--accent)";
          e.target.style.boxShadow = "0 0 0 3px rgba(43,91,255,0.12)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = error ? "var(--danger)" : "var(--border)";
          e.target.style.boxShadow = "none";
        }}
        {...props}
      />
      {error && (
        <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
