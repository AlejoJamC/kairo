import type { CSSProperties, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Chip — the pill/badge primitive. The `borderRadius: 999` + 1px border +
// small mono label pattern was duplicated across ten components; this is the
// shared version, with the tones the design system actually uses.
// ---------------------------------------------------------------------------

export type ChipTone = "neutral" | "note" | "mention" | "mention-solid" | "accent";

const TONES: Record<ChipTone, CSSProperties> = {
  neutral: {
    background: "white",
    color: "var(--k-text-secondary)",
    borderColor: "var(--k-border)",
  },
  // Amber "team only" family — internal notes (KAI-232).
  note: {
    background: "var(--k-note-bg)",
    color: "var(--k-note-label)",
    borderColor: "var(--k-note-border)",
  },
  // Mentions stay in the accent family even on amber surfaces.
  mention: {
    background: "var(--k-mention-bg)",
    color: "var(--k-accent)",
    borderColor: "var(--k-mention-border)",
  },
  // A mention of the current user — solid, so "you were tagged" is unmissable.
  "mention-solid": {
    background: "var(--k-mention-solid)",
    color: "white",
    borderColor: "var(--k-mention-solid)",
  },
  accent: {
    background: "var(--k-accent-subtle)",
    color: "var(--k-accent)",
    borderColor: "var(--k-accent-border)",
  },
};

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  /** Mono, uppercase, letter-spaced — for labels like "TEAM ONLY". */
  mono?: boolean;
  size?: "sm" | "md";
  icon?: ReactNode;
  title?: string;
  "aria-label"?: string;
  style?: CSSProperties;
}

export function Chip({
  children,
  tone = "neutral",
  mono = false,
  size = "md",
  icon,
  title,
  "aria-label": ariaLabel,
  style,
}: ChipProps) {
  return (
    <span
      title={title}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: size === "sm" ? "1px 6px" : "2px 7px",
        borderRadius: 999,
        border: "1px solid",
        fontSize: mono ? (size === "sm" ? 9.5 : 10) : size === "sm" ? 10.5 : 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
        ...(mono
          ? { fontFamily: "var(--k-font-mono)", letterSpacing: "0.03em" }
          : null),
        ...TONES[tone],
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  );
}
