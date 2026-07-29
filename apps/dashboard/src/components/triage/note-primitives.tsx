import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Chip } from "@/components/ui/chip";

// ---------------------------------------------------------------------------
// KAI-232 — small shared pieces of the internal-notes surface. Kept here (not
// inlined per screen) because the composer, the thread, the Notes tab and the
// bell all reuse them, and the amber grammar must stay identical across the
// four. All colors come from the --k-note-* / --k-mention-* tokens.
// ---------------------------------------------------------------------------

/** "TEAM ONLY" — the permanent reminder that a note never reaches the customer. */
export function TeamOnlyChip({ size = "md" }: { size?: "sm" | "md" }) {
  const { t } = useTranslation("dashboard");
  return (
    <Chip tone="note" mono size={size} icon={<Lock style={{ width: size === "sm" ? 9 : 10, height: size === "sm" ? 9 : 10 }} />}>
      {t("notes.teamOnly", "TEAM ONLY")}
    </Chip>
  );
}

/** Header of the Notes tab: count + the primary "new note" action. */
export function NotesHeader({ count, onNewNote }: { count: number; onNewNote?: () => void }) {
  const { t } = useTranslation("dashboard");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span
        style={{
          fontFamily: "var(--k-font-mono)",
          fontSize: 10.5,
          color: "var(--k-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {t("notes.count", { count, defaultValue: "{{count}} notes · this ticket" })}
      </span>
      {onNewNote && (
        <button
          type="button"
          onClick={onNewNote}
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 5,
            border: "1px solid var(--k-note-border)",
            background: "var(--k-note-bg)",
            color: "var(--k-note-label)",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          + {t("notes.new", "New note")}
        </button>
      )}
    </div>
  );
}

/** Always-visible privacy note — deliberately not a tooltip (design spec B1). */
export function PrivacyFootnote() {
  const { t } = useTranslation("dashboard");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        marginTop: 4,
        padding: "8px 10px",
        borderRadius: 6,
        background: "var(--k-surface)",
        border: "1px solid var(--k-border-subtle)",
      }}
    >
      <Lock style={{ width: 11, height: 11, color: "var(--k-text-tertiary)", flexShrink: 0, marginTop: 2 }} />
      <span style={{ fontSize: 11, color: "var(--k-text-tertiary)", lineHeight: 1.45 }}>
        {t("notes.privacy", "Internal notes are never sent to or visible by the customer.")}
      </span>
    </div>
  );
}

/** The system's empty-state block — same shape as the other right-panel tabs. */
export function EmptyBlock({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ padding: "46px 22px", textAlign: "center" }}>
      <div
        style={{
          fontFamily: "var(--k-font-mono)",
          fontSize: 18,
          color: "var(--k-border)",
          marginBottom: 10,
        }}
      >
        ◌
      </div>
      <div style={{ fontSize: 13, color: "var(--k-text-secondary)", fontWeight: 500, marginBottom: 5 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--k-text-tertiary)",
          lineHeight: 1.5,
          maxWidth: 240,
          margin: "0 auto",
        }}
      >
        {sub}
      </div>
      {children && <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>{children}</div>}
    </div>
  );
}

/** Loading placeholder with the real card's amber outline and metrics. */
export function NoteSkeleton() {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        marginBottom: 8,
        background: "var(--k-note-bg)",
        border: "1px solid var(--k-note-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <div className="shimmer-note" style={{ width: 20, height: 20, borderRadius: 999 }} />
        <div className="shimmer-note" style={{ height: 9, width: 92 }} />
        <div className="shimmer-note" style={{ height: 8, width: 34, marginLeft: "auto" }} />
      </div>
      <div className="shimmer-note" style={{ height: 8, width: "100%", marginBottom: 6 }} />
      <div className="shimmer-note" style={{ height: 8, width: "72%" }} />
    </div>
  );
}
