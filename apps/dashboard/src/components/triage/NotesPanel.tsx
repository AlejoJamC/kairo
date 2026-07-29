import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiCall } from "@/lib/api-client";
import { useTriageStore } from "@/stores/triage-store";
import { NoteCard } from "./note-card";
import {
  NotesHeader,
  NoteSkeleton,
  PrivacyFootnote,
  EmptyBlock,
  TeamOnlyChip,
} from "./note-primitives";
import type { ThreadMessage } from "@/hooks/use-ticket-thread";

// ---------------------------------------------------------------------------
// KAI-232 / ADR-025 §7.2 — right-panel "Notes" tab.
//
// A filtered view of just the internal notes on the selected ticket, newest
// first, so the internal conversation can be reviewed without scrolling the
// customer thread. Clicking a note scrolls the center thread to it.
//
// Covers design spec states B1 (default), B2 (all read), B3 (hover, in
// NoteCard), B6 (loading), B7 (empty) and B8 (no ticket selected).
//
// Fetches its own data like the other right-panel tabs rather than lifting
// thread state out of ticket-detail.tsx.
// ---------------------------------------------------------------------------

// Minimum time the skeleton stays up, so a fast response doesn't flash (B6).
const MIN_SKELETON_MS = 300;

// A note's mention is marked read once it has been visible this long (rule F.1).
const MARK_READ_AFTER_MS = 1200;

interface NotesPanelProps {
  ticketId: string | null;
  /** Focuses the composer in note mode — the empty state's primary action. */
  onNewNote?: () => void;
}

export function NotesPanel({ ticketId, onNewNote }: NotesPanelProps) {
  const { t } = useTranslation("dashboard");
  const [notes, setNotes] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const requestScrollToMessage = useTriageStore((s) => s.requestScrollToMessage);

  useEffect(() => {
    if (!ticketId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const startedAt = Date.now();

    apiCall(`/api/v1/tickets/${ticketId}/messages`)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((body: { messages?: ThreadMessage[] }) => {
        if (cancelled) return;
        // Newest first — the opposite of the center thread's chronology.
        const internal = (body.messages ?? [])
          .filter((m) => m.direction === "internal")
          .reverse();
        const elapsed = Date.now() - startedAt;
        const settle = () => {
          if (cancelled) return;
          setNotes(internal);
          setLoading(false);
        };
        if (elapsed >= MIN_SKELETON_MS) settle();
        else setTimeout(settle, MIN_SKELETON_MS - elapsed);
      })
      .catch(() => {
        if (cancelled) return;
        setNotes([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticketId]);

  // Rule F.1: a note counts as read after 1.2s of visibility in this tab.
  // Clears the unread treatment locally and stamps the mention server-side.
  const unreadIds = notes.filter((n) => n.mention_unread).map((n) => n.id);
  const unreadKey = unreadIds.join(",");

  useEffect(() => {
    if (unreadIds.length === 0) return;

    const timer = setTimeout(() => {
      setNotes((prev) => prev.map((n) => (n.mention_unread ? { ...n, mention_unread: false } : n)));
      // Best-effort: the visual state has already settled either way.
      apiCall("/api/v1/notes/mentions/read", {
        method: "PATCH",
        body: JSON.stringify({ ticket_event_ids: unreadIds }),
      }).catch(() => {});
    }, MARK_READ_AFTER_MS);

    return () => clearTimeout(timer);
    // unreadKey keeps this from re-firing on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  if (!ticketId) {
    return (
      <EmptyBlock
        title={t("notes.noTicket", "No ticket selected")}
        sub={t("notes.noTicketHint", "Pick a ticket from the queue to see its internal notes and mentions.")}
      />
    );
  }

  if (loading) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span
            className="pulse"
            style={{ width: 5, height: 5, borderRadius: 999, background: "var(--k-note-rail)" }}
          />
          <span
            style={{
              fontFamily: "var(--k-font-mono)",
              fontSize: 10.5,
              color: "var(--k-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {t("notes.loading", "loading notes…")}
          </span>
        </div>
        <NoteSkeleton />
        <NoteSkeleton />
        <NoteSkeleton />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div>
        {/* The header stays: "New note" is the empty state's main action (B7). */}
        <NotesHeader count={0} onNewNote={onNewNote} />
        <EmptyBlock
          title={t("notes.empty.title", "No internal notes yet")}
          sub={t("notes.empty.hint", "Write the first one from the composer's «Internal note» mode. Only your team can see them.")}
        >
          <TeamOnlyChip />
        </EmptyBlock>
      </div>
    );
  }

  return (
    <div>
      <NotesHeader count={notes.length} onNewNote={onNewNote} />
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onJump={requestScrollToMessage} />
      ))}
      <PrivacyFootnote />
    </div>
  );
}
