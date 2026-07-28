import { useTranslation } from "react-i18next";
import { parseNoteBody } from "@/lib/note-mentions";
import type { NoteMention } from "@/hooks/use-ticket-thread";

// ---------------------------------------------------------------------------
// KAI-232 — renders an internal-note body with `@[user:<uuid>]` tokens drawn
// as highlighted mention chips. Shared by the center thread (ticket-detail)
// and the right-panel Notes tab so both read a note identically.
// ---------------------------------------------------------------------------

interface NoteBodyProps {
  body: string | null;
  mentions?: NoteMention[];
  /** Base text style — the surrounding card owns color and sizing. */
  style?: React.CSSProperties;
}

export function NoteBody({ body, mentions = [], style }: NoteBodyProps) {
  const { t } = useTranslation("dashboard");
  const segments = parseNoteBody(body, mentions);

  if (segments.length === 0) return null;

  return (
    <pre
      style={{
        fontFamily: "inherit",
        fontSize: 13,
        lineHeight: 1.65,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowX: "hidden",
        margin: 0,
        ...style,
      }}
    >
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <span key={index}>{segment.value}</span>
        ) : (
          <span
            key={index}
            // An unresolved id still renders — the person may have been
            // removed from the account since the note was written.
            title={segment.name ?? undefined}
            style={{
              display: "inline-block",
              fontWeight: 600,
              color: "var(--k-accent)",
              background: "var(--k-accent-subtle)",
              border: "1px solid #C7D2FE",
              borderRadius: 4,
              padding: "0 4px",
              lineHeight: 1.5,
            }}
          >
            @{segment.name ?? t("notes.unknownMember", "member")}
          </span>
        ),
      )}
    </pre>
  );
}
