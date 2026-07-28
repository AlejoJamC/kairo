import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { apiCall } from "@/lib/api-client";
import { useTriageStore } from "@/stores/triage-store";
import { NoteBody } from "./note-body";
import type { ThreadMessage } from "@/hooks/use-ticket-thread";

// ---------------------------------------------------------------------------
// KAI-232 / ADR-025 §7.2 — right-panel "Notes" tab.
//
// A filtered view of just the internal notes on the selected ticket, so the
// internal conversation can be reviewed without scrolling the customer thread.
// Clicking a note scrolls the center thread to it (ADR-011 cross-panel signal).
//
// Fetches its own data like the other right-panel tabs rather than lifting the
// thread state out of ticket-detail.tsx.
// ---------------------------------------------------------------------------

interface NotesPanelProps {
  ticketId: string | null;
}

export function NotesPanel({ ticketId }: NotesPanelProps) {
  const { t, i18n } = useTranslation("dashboard");
  const [notes, setNotes] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const requestScrollToMessage = useTriageStore((s) => s.requestScrollToMessage);

  useEffect(() => {
    if (!ticketId) {
      setNotes([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    apiCall(`/api/v1/tickets/${ticketId}/messages`)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((body: { messages?: ThreadMessage[] }) => {
        if (cancelled) return;
        setNotes((body.messages ?? []).filter((m) => m.direction === "internal"));
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticketId]);

  if (loading) {
    return (
      <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", margin: 0 }}>
        {t("notes.loading", "Loading notes…")}
      </p>
    );
  }

  if (notes.length === 0) {
    return (
      <div style={{ padding: "28px 8px", textAlign: "center" }}>
        <Lock
          style={{ width: 18, height: 18, color: "var(--k-text-tertiary)", margin: "0 auto 8px" }}
        />
        <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", margin: 0, lineHeight: 1.5 }}>
          {t("notes.empty", "No internal notes on this ticket yet.")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => requestScrollToMessage(note.id)}
          title={t("notes.jumpToNote", "Show this note in the conversation")}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            borderLeft: "3px solid #F59E0B",
            border: "1px solid #FDE68A",
            borderRadius: 8,
            background: "#FFFBEB",
            padding: "9px 11px",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#92400E" }}>
              {note.sender_display_name
                ?? note.sender_external_id
                ?? t("ticketDetail.agent", "Agent")}
            </span>
            <span style={{ fontSize: 11, color: "#A16207", marginLeft: "auto", flexShrink: 0 }}>
              {note.received_at
                ? new Date(note.received_at).toLocaleString(i18n.language)
                : ""}
            </span>
          </div>
          <NoteBody
            body={note.body_plain ?? note.snippet ?? null}
            mentions={note.mentions}
            style={{ color: "#78350F", fontSize: 12 }}
          />
        </button>
      ))}
    </div>
  );
}
