import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReplyBar } from "./reply-bar";
import { TicketHeader } from "./ticket-header";
import { isTriageActive } from "@/lib/triage-status";
import { useTriageStore } from "@/stores/triage-store";
import { useTicketThread, type ThreadMessage } from "@/hooks/use-ticket-thread";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { NoteBody } from "./triage/note-body";
import { TeamOnlyChip } from "./triage/note-primitives";
import { Avatar, getInitials } from "./ui/avatar";
import { getLandingUrl } from "@/lib/api-client";
import type { Ticket } from "@kairo/types";
import { computeTicketOperationalSla } from "@kairo/types";

// Delay before clearing the selection once the open ticket leaves the active queue.
const CLEAR_AFTER_LEAVING_ACTIVE_MS = 2500;

// KAI-232 — how long a message stays ring-highlighted after being scrolled to.
const HIGHLIGHT_DURATION_MS = 2000;

// ---------------------------------------------------------------------------
// KAI-168 — operational SLA (by ticket priority) progress bar. Shown below
// the subject, above the AI reasoning banner. Own domain — computed
// client-side from the ticket's own priority/received_at/first_response_at
// plus the account's SLA config (tickets arrive raw from Supabase, so this
// can't be a pre-computed field on the wire — see computeTicketOperationalSla).
// ---------------------------------------------------------------------------

// Smallest comfortable width for this column — same constant already used as
// `centerMin` by useResizablePanel (apps/dashboard/src/hooks/use-resizable-panel.ts)
// to keep this exact column readable when the right panel is dragged wider.
// That value was only ever enforced against the right panel's own max width;
// this applies it as a real min-width on the center column itself, so it no
// longer collapses when the window is narrowed (unlike the ticket-list
// column, fixed at 360px, and the right panel, floored at 340px).
const CENTER_PANEL_MIN_WIDTH = 520;

const PRIORITY_SLA_BAR_COLOR: Record<"ok" | "at_risk" | "breached", string> = {
  ok: "#10B981",
  at_risk: "#F97316",
  breached: "#EF4444",
};

// "Xd Xh Xm" — always shows the largest unit down to minutes so nothing
// renders as an unreadable "1171h 25m"; drops leading zero units instead of
// always printing all three (e.g. "19h 25m" under a day, "25m" under an hour).
function formatDurationParts(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function PrioritySlaBar({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation("dashboard");
  const config = useTriageStore((s) => s.operationalSlaConfig);
  const sla = useMemo(() => computeTicketOperationalSla(ticket, config), [ticket, config]);
  if (!sla) return null;

  const duration = formatDurationParts(sla.status === "breached" ? sla.overdueSeconds : sla.remainingSeconds);

  const detail =
    sla.status === "ok"
      ? t("prioritySla.detailRemaining", { duration })
      : sla.status === "at_risk"
        ? t("prioritySla.detailDueSoon", { duration })
        : t("prioritySla.detailOverdue", { duration });

  const barWidth = Math.min(100, sla.percentUsed);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ height: 6, borderRadius: 3, background: "var(--k-border-subtle)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${barWidth}%`,
            background: PRIORITY_SLA_BAR_COLOR[sla.status],
            borderRadius: 3,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: PRIORITY_SLA_BAR_COLOR[sla.status], fontWeight: 500 }}>{detail}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sender avatar (initials circle)
// ---------------------------------------------------------------------------

function SenderAvatar({ name, email }: { name: string | null; email: string | null }) {
  const initials = getInitials(name, email);
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--k-accent-subtle)",
        border: "1.5px solid #C7D2FE",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--k-accent)",
        flexShrink: 0,
        letterSpacing: "0.02em",
      }}
    >
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageCard — renders a single thread message
// ---------------------------------------------------------------------------

// sender_external_id stores the raw `From:` header (e.g. "Name <email>"), not
// a bare email — extract the address before displaying it next to the name.
function extractEmailAddress(raw: string): string {
  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim();
  return raw.trim();
}

function MessageCard({ message, jumped = false }: { message: ThreadMessage; jumped?: boolean }) {
  const { t } = useTranslation("dashboard");
  const isOutbound = message.direction === "outbound";
  const isInternal = message.direction === "internal";

  const senderLabel = isInternal || isOutbound
    ? (message.sender_display_name ?? message.sender_external_id ?? t("ticketDetail.agent", "Agent"))
    : (message.sender_display_name ?? message.sender_external_id ?? t("ticketDetail.unknownSender", "Unknown sender"));

  const senderEmail = !isOutbound && !isInternal && message.sender_display_name && message.sender_external_id
    ? `<${extractEmailAddress(message.sender_external_id)}>`
    : "";

  const timestamp = message.received_at
    ? new Date(message.received_at).toLocaleString()
    : "";

  const bodyText = message.body_plain ?? message.snippet ?? null;

  // Internal note: amber card, full-width, no avatar offset (KAI-232 spec B5)
  if (isInternal) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          borderLeft: "3px solid var(--k-note-rail)",
          background: "var(--k-note-bg)",
          border: "1px solid var(--k-note-border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "10px 14px",
            borderBottom: "1px solid var(--k-note-border)",
          }}
        >
          <Avatar
            name={message.sender_display_name}
            email={message.sender_external_id}
            seed={message.author_id ?? message.sender_external_id}
            size={22}
          />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--k-note-text-strong)" }}>
            {message.is_own_note ? t("notes.you", "You") : senderLabel}
          </span>
          <TeamOnlyChip />
          {/* Only exists while the jump highlight is running (spec B5). */}
          {jumped && (
            <span
              style={{
                fontFamily: "var(--k-font-mono)",
                fontSize: 9.5,
                color: "var(--k-note-label)",
                background: "rgba(245,158,11,0.16)",
                padding: "2px 6px",
                borderRadius: 3,
                letterSpacing: "0.04em",
              }}
            >
              ↳ {t("notes.jumpedFromNotes", "JUMPED FROM NOTES")}
            </span>
          )}
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--k-font-mono)",
              fontSize: 10.5,
              color: "var(--k-note-label)",
              flexShrink: 0,
            }}
          >
            {timestamp}
          </span>
        </div>
        <div style={{ padding: "12px 14px" }}>
          {/* KAI-232: mention tokens render as chips, never as raw @[user:…]. */}
          <NoteBody
            body={bodyText}
            mentions={message.mentions}
            style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--k-note-text-strong)" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginLeft: isOutbound ? 48 : 0,
        marginRight: isOutbound ? 0 : 48,
      }}
    >
      {/* Message header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <SenderAvatar
          name={message.sender_display_name}
          email={message.sender_external_id}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--k-text-primary)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {senderLabel}
            </p>
            {message.is_origin && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--k-accent)",
                  background: "var(--k-accent-subtle)",
                  border: "1px solid #C7D2FE",
                  borderRadius: 4,
                  padding: "1px 5px",
                  flexShrink: 0,
                }}
              >
                {t("ticketDetail.originMessage", "Initial message")}
              </span>
            )}
            {isOutbound && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#6B7280",
                  background: "#F3F4F6",
                  border: "1px solid #E5E7EB",
                  borderRadius: 4,
                  padding: "1px 5px",
                  flexShrink: 0,
                }}
              >
                {t("ticketDetail.outbound", "Reply sent")}
              </span>
            )}
            {isOutbound && message.delivery_status && message.delivery_status !== "sent" && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: message.delivery_status === "failed" ? "#B91C1C" : "#92400E",
                  background: message.delivery_status === "failed" ? "#FEF2F2" : "#FFFBEB",
                  border: `1px solid ${message.delivery_status === "failed" ? "#FECACA" : "#FDE68A"}`,
                  borderRadius: 4,
                  padding: "1px 5px",
                  flexShrink: 0,
                }}
              >
                {message.delivery_status === "failed"
                  ? t("ticketDetail.deliveryFailed", "Failed to send")
                  : t("ticketDetail.deliverySending", "Sending…")}
              </span>
            )}
            {isOutbound
              && message.delivery_status === "failed"
              && message.send_error?.code === "INSUFFICIENT_SCOPE" && (
              <button
                type="button"
                onClick={() => { window.location.href = getLandingUrl("/bff/auth/google"); }}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--k-accent)",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                  flexShrink: 0,
                }}
              >
                {t("ticketDetail.reconnectGmail", "Reconnect Gmail to retry")}
              </button>
            )}
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--k-text-tertiary)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {senderEmail}
            {timestamp ? (senderEmail ? ` · ${timestamp}` : timestamp) : ""}
          </p>
        </div>
      </div>

      {/* Message body */}
      <div
        style={{
          background: isOutbound ? "var(--k-accent-subtle)" : "white",
          border: `1px solid ${isOutbound ? "#C7D2FE" : "var(--k-border)"}`,
          borderRadius: 10,
          overflow: "hidden",
          padding: "14px 16px",
        }}
      >
        {bodyText ? (
          <pre
            style={{
              fontFamily: "inherit",
              fontSize: 13,
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflowX: "hidden",
              color: "var(--k-text-primary)",
              margin: 0,
            }}
          >
            {bodyText}
          </pre>
        ) : (
          <p
            style={{
              margin: 0,
              fontStyle: "italic",
              color: "var(--k-text-tertiary)",
              fontSize: 13,
            }}
          >
            {t("ticketDetail.noBody", "No email body available.")}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TicketDetail
// ---------------------------------------------------------------------------

export function TicketDetail() {
  const { t } = useTranslation("dashboard");
  const { tickets, selectedTicketId, selectTicket } = useTriageStore();
  const ticket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  const { messages: allMessages, loading: threadLoading, appendOptimisticMessage } = useTicketThread(ticket?.id ?? null);

  // KAI-232: with the internal-notes flag OFF the thread is customer-only —
  // notes are never rendered, restoring the pre-KAI-221 surface.
  const messages = useMemo(
    () => (INTERNAL_NOTES_ENABLED ? allMessages : allMessages.filter((m) => m.direction !== "internal")),
    [allMessages],
  );

  // KAI-232 — cross-panel scroll target (ADR-011): the Notes tab and mention
  // notifications ask the thread to reveal one specific message.
  const scrollToMessageId = useTriageStore((s) => s.scrollToMessageId);
  const clearScrollToMessage = useTriageStore((s) => s.clearScrollToMessage);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!scrollToMessageId) return;
    const el = messageRefs.current.get(scrollToMessageId);
    // The thread may still be loading when the request arrives; the effect
    // re-runs once `messages` lands and the ref exists.
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(scrollToMessageId);
    clearScrollToMessage();

    const timer = setTimeout(() => setHighlightedMessageId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [scrollToMessageId, messages, clearScrollToMessage]);

  // KAI-25 — resolved/ai_resolved tickets render read-only (no reply/note input).
  const isReadOnly = ticket ? ticket.status === "resolved" || ticket.status === "ai_resolved" : false;

  // Auto-clear the selection on an active->inactive transition for this same
  // ticket (not on tickets already inactive when opened, e.g. browsing Resuelto).
  // Lives here, not in ReplyBar, because ReplyBar unmounts the instant isReadOnly
  // flips true, which would cancel a timer scheduled from inside it.
  const prevActiveRef = useRef<{ ticketId: string | null; active: boolean }>({ ticketId: null, active: false });
  const deselectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevActiveRef.current;
    const active = ticket ? isTriageActive(ticket.status) : false;
    const justLeftActiveView = ticket !== null && prev.ticketId === ticket.id && prev.active && !active;

    if (justLeftActiveView && ticket) {
      const ticketId = ticket.id;
      if (deselectTimerRef.current) clearTimeout(deselectTimerRef.current);
      deselectTimerRef.current = setTimeout(() => {
        if (useTriageStore.getState().selectedTicketId === ticketId) {
          selectTicket(null);
        }
      }, CLEAR_AFTER_LEAVING_ACTIVE_MS);
    }

    prevActiveRef.current = { ticketId: ticket?.id ?? null, active };
  }, [ticket, selectTicket]);

  // Cancel a pending auto-clear when navigating away from this ticket, or on unmount.
  useEffect(() => {
    return () => {
      if (deselectTimerRef.current) clearTimeout(deselectTimerRef.current);
    };
  }, [ticket?.id]);

  if (!ticket) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: CENTER_PANEL_MIN_WIDTH,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--k-surface)",
          gap: 8,
        }}
      >
        <Mail style={{ width: 40, height: 40, color: "var(--k-border)" }} />
        <p style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>
          {t("ticketDetail.selectPrompt", "Select a ticket to view details")}
        </p>
      </div>
    );
  }

  const receivedDate = ticket.received_at
    ? new Date(ticket.received_at).toLocaleString()
    : null;

  return (
    <div
      style={{
        flex: 1,
        minWidth: CENTER_PANEL_MIN_WIDTH,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--k-surface)",
      }}
    >
      <TicketHeader ticket={ticket} readOnly={isReadOnly} />

      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Subject h1 */}
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--k-text-primary)",
            margin: 0,
            lineHeight: 1.3,
            letterSpacing: "-0.02em",
          }}
        >
          {ticket.subject ?? t("ticketDetail.noSubject", "(Sin asunto)")}
        </h1>

        <PrioritySlaBar ticket={ticket} />

        {/* AI reasoning banner */}
        {ticket.ai_reasoning && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: "8px 10px",
              background: "var(--k-accent-subtle)",
              borderRadius: 6,
              border: "1px solid #DBE3FF",
            }}
          >
            <Sparkles
              style={{ width: 13, height: 13, color: "var(--k-accent)", flexShrink: 0, marginTop: 1 }}
            />
            <div style={{ fontSize: 12, color: "var(--k-text-secondary)", flex: 1, lineHeight: 1.5 }}>
              <span style={{ color: "var(--k-accent)", fontWeight: 500 }}>
                Triage Intelligence
              </span>{" "}
              {ticket.ai_reasoning}
            </div>
          </div>
        )}

        {/* Thread: render message cards if available, fallback to legacy body_plain */}
        {threadLoading ? (
          /* Skeleton while loading */
          <div
            style={{
              background: "white",
              border: "1px solid var(--k-border)",
              borderRadius: 12,
              padding: "18px 20px",
              opacity: 0.5,
            }}
          >
            <div
              style={{
                height: 14,
                background: "var(--k-border)",
                borderRadius: 4,
                marginBottom: 8,
                width: "60%",
              }}
            />
            <div
              style={{
                height: 14,
                background: "var(--k-border)",
                borderRadius: 4,
                width: "90%",
              }}
            />
          </div>
        ) : messages.length > 0 ? (
          /* Thread view — N message cards in chronological order */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                ref={(el) => {
                  if (el) messageRefs.current.set(msg.id, el);
                  else messageRefs.current.delete(msg.id);
                }}
                // KAI-232 spec B5: outline + amber halo fading out over 1.6s.
                // Driven by a CSS class so the animation cannot drift from the
                // token values (see .note-jump-highlight in index.css).
                className={highlightedMessageId === msg.id ? "note-jump-highlight" : undefined}
              >
                <MessageCard message={msg} jumped={highlightedMessageId === msg.id} />
              </div>
            ))}
          </div>
        ) : (
          /* Fallback — pre-backfill safety net: render legacy body_plain */
          <>
            {/* Sender row (legacy) */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <SenderAvatar name={ticket.from_name} email={ticket.from_email} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--k-text-primary)",
                    margin: "0 0 2px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ticket.from_name ?? ticket.from_email ?? t("ticketDetail.unknownSender", "Unknown sender")}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--k-text-tertiary)",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ticket.from_email && ticket.from_name ? `<${ticket.from_email}>` : ""}
                  {receivedDate ? ` · ${receivedDate}` : ""}
                </p>
              </div>
            </div>

            {/* Email body card (legacy) */}
            <div
              style={{
                background: "white",
                border: "1px solid var(--k-border)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "18px 20px 22px",
                  fontSize: 14,
                  color: "var(--k-text-primary)",
                  lineHeight: 1.65,
                }}
              >
                {ticket.body_plain ? (
                  <pre
                    style={{
                      fontFamily: "inherit",
                      fontSize: 14,
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowX: "hidden",
                      color: "var(--k-text-primary)",
                      margin: 0,
                    }}
                  >
                    {ticket.body_plain}
                  </pre>
                ) : ticket.snippet ? (
                  <p style={{ margin: 0, lineHeight: 1.65 }}>{ticket.snippet}</p>
                ) : (
                  <p
                    style={{
                      margin: 0,
                      fontStyle: "italic",
                      color: "var(--k-text-tertiary)",
                    }}
                  >
                    {t("ticketDetail.noBody", "No email body available.")}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Fixed bottom reply bar — hidden for read-only historical tickets */}
      {isReadOnly ? (
        <div
          style={{
            borderTop: "1px solid var(--k-border)",
            padding: "10px 16px",
            fontSize: 12,
            color: "var(--k-text-tertiary)",
            background: "var(--k-surface)",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          {t("ticketDetail.readOnlyBanner")}
        </div>
      ) : (
        <ReplyBar onReplyQueued={appendOptimisticMessage} />
      )}
    </div>
  );
}
