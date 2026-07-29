import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { NoteBody } from "./note-body";
import type { ThreadMessage } from "@/hooks/use-ticket-thread";

// ---------------------------------------------------------------------------
// KAI-232 · design spec B3/B4 — a single internal note in the Notes tab.
//
// Three visual states, all driven by data rather than props the caller has to
// reason about:
//   unread  → this note mentions the viewer and they haven't read it:
//             stronger amber, accent rail, ringed avatar, "MENTIONED YOU", dot
//   hover   → amber hover border, lift, and the "view in thread" affordance
//   default → calm amber
//
// The whole card is the jump target: clicking scrolls the center thread to
// this note (ADR-011 cross-panel signal).
// ---------------------------------------------------------------------------

interface NoteCardProps {
  note: ThreadMessage;
  onJump: (messageId: string) => void;
}

export function NoteCard({ note, onJump }: NoteCardProps) {
  const { t, i18n } = useTranslation("dashboard");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const unread = note.mention_unread === true;
  // Keyboard focus replicates the hover treatment exactly (spec B3).
  const raised = hovered || focused;

  const authorLabel = note.is_own_note
    ? t("notes.you", "You")
    : note.sender_display_name ?? note.sender_external_id ?? t("ticketDetail.agent", "Agent");

  const borderColor = unread || raised ? "var(--k-note-border-hover)" : "var(--k-note-border)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onJump(note.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onJump(note.id);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      title={t("notes.jump", "View in thread")}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        textAlign: "left",
        font: "inherit",
        padding: "10px 12px",
        borderRadius: 8,
        marginBottom: 8,
        background: unread ? "var(--k-note-bg-strong)" : "var(--k-note-bg)",
        border: `1px solid ${borderColor}`,
        borderLeft: unread ? "2px solid var(--k-mention-solid)" : `1px solid ${borderColor}`,
        boxShadow: raised ? "0 2px 8px rgba(146,64,14,0.10)" : "none",
        transform: raised ? "translateY(-1px)" : "none",
        cursor: "pointer",
        transition: "all .12s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Avatar
          name={note.sender_display_name}
          email={note.sender_external_id}
          seed={note.author_id ?? note.sender_external_id}
          size={20}
          ring={unread}
        />
        <span
          style={{
            fontSize: 12.5,
            fontWeight: unread ? 600 : 500,
            color: "var(--k-note-text-strong)",
          }}
        >
          {authorLabel}
        </span>
        {unread && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 5px",
              borderRadius: 3,
              background: "var(--k-mention-solid)",
              color: "white",
              fontFamily: "var(--k-font-mono)",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            {t("notes.mentionedYou", "MENTIONED YOU")}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontFamily: "var(--k-font-mono)",
              fontSize: 10,
              color: unread ? "var(--k-note-label)" : "#B98A3E",
            }}
          >
            {note.received_at ? new Date(note.received_at).toLocaleString(i18n.language) : ""}
          </span>
          {unread && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--k-mention-solid)",
                flexShrink: 0,
              }}
            />
          )}
        </span>
      </div>

      <NoteBody
        body={note.body_plain ?? note.snippet ?? null}
        mentions={note.mentions}
        style={{
          fontSize: 12.5,
          lineHeight: 1.55,
          color: unread ? "var(--k-note-text-strong)" : "var(--k-note-text)",
        }}
      />

      {raised && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 7,
            borderTop: "1px dashed var(--k-note-border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: "var(--k-font-mono)",
              fontSize: 10,
              color: "var(--k-note-label)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ArrowRight style={{ width: 10, height: 10 }} />
            {t("notes.jump", "View in thread")}
          </span>
        </div>
      )}
    </div>
  );
}
