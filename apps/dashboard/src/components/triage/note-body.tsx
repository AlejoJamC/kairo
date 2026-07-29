import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { parseNoteBody } from "@/lib/note-mentions";
import type { NoteMention } from "@/hooks/use-ticket-thread";

// ---------------------------------------------------------------------------
// KAI-232 — renders an internal-note body with `@[user:<uuid>]` tokens drawn
// as mention chips. Shared by the center thread (ticket-detail) and the
// right-panel Notes tab so both read a note identically.
//
// A mention of the current viewer renders SOLID accent; mentions of others
// render as a calm soft chip (design spec B4). Which is which comes from the
// API's `is_me`, so this component needs no identity of its own.
// ---------------------------------------------------------------------------

interface NoteBodyProps {
  body: string | null;
  mentions?: NoteMention[];
  /** Base text style — the surrounding card owns color and sizing. */
  style?: CSSProperties;
}

export function NoteBody({ body, mentions = [], style }: NoteBodyProps) {
  const { t } = useTranslation("dashboard");
  const segments = parseNoteBody(body, mentions);

  if (segments.length === 0) return null;

  const isMeById = new Map(mentions.map((m) => [m.user_id.toLowerCase(), m.is_me === true]));

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
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.value}</span>;
        }
        const isMe = isMeById.get(segment.userId) === true;
        return (
          <span
            key={index}
            // An unresolved id still renders — the person may have left the
            // account since the note was written.
            title={segment.name ?? undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0.5px 5px",
              borderRadius: 4,
              fontSize: "0.94em",
              fontWeight: 500,
              whiteSpace: "nowrap",
              background: isMe ? "var(--k-mention-solid)" : "var(--k-mention-bg)",
              color: isMe ? "white" : "var(--k-accent)",
              border: `1px solid ${isMe ? "var(--k-mention-solid)" : "var(--k-mention-border)"}`,
            }}
          >
            @{segment.name ?? t("notes.unknownMember", "member")}
          </span>
        );
      })}
    </pre>
  );
}
