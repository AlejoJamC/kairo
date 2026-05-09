import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, ArrowUp } from "lucide-react";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// Priority stripe — left accent bar (color driven by sentiment)
// ---------------------------------------------------------------------------

function stripeColor(sentiment: string | null | undefined): string {
  const s = (sentiment ?? "").toLowerCase();
  if (["urgent", "negative", "aggressive", "frustrated"].includes(s)) return "#EF4444";
  if (s === "neutral") return "#F59E0B";
  return "#10B981"; // positive / casual / unknown
}

// ---------------------------------------------------------------------------
// Priority badge
// ---------------------------------------------------------------------------

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  P1: { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" },
  P2: { background: "#FFF7ED", color: "#C2410C", border: "1px solid #FED7AA" },
  P3: { background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A" },
  P4: { background: "#F4F4F5", color: "#71717A", border: "1px solid #E4E4E7" },
};

function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return null;
  const p = priority.toUpperCase();
  const style = PRIORITY_STYLE[p] ?? { background: "#F4F4F5", color: "#71717A", border: "1px solid #E4E4E7" };
  return (
    <span
      style={{
        ...style,
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 4,
        letterSpacing: "0.02em",
      }}
    >
      {p}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

function typeBadgeStyle(type: string | null | undefined): React.CSSProperties {
  const t = (type ?? "").toLowerCase();
  if (t === "lead" || t === "prospect") return { background: "#ECFDF5", color: "#047857" };
  if (t === "spam") return { background: "#F4F4F5", color: "#71717A" };
  return { background: "#EEF2FF", color: "#2B5BFF" };
}

function typeLabel(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t === "lead" || t === "prospect") return "LEAD";
  if (t === "spam") return "SPAM";
  return "SOPORTE";
}

// ---------------------------------------------------------------------------
// SLA badge
// ---------------------------------------------------------------------------

interface SlaBadgeProps {
  slaDate: string | null | undefined;
}

function SlaBadge({ slaDate }: SlaBadgeProps) {
  const { t } = useTranslation("dashboard");

  const label = useMemo(() => {
    if (!slaDate) return null;
    const now = Date.now();
    const due = new Date(slaDate).getTime();
    const diff = due - now;

    if (diff <= 0) return { text: t("ticketCard.slaBreached"), breached: true };

    const totalMinutes = Math.floor(diff / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return { text: t("ticketCard.slaHours_other", { count: hours, minutes }), breached: false };
    }
    return { text: t("ticketCard.slaMinutes_other", { count: totalMinutes }), breached: false };
  }, [slaDate, t]);

  if (!label) return null;

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 4,
        background: label.breached ? "#FEF2F2" : "#F4F4F5",
        color: label.breached ? "#DC2626" : "#71717A",
      }}
    >
      {label.text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Relative timestamp
// ---------------------------------------------------------------------------

function useRelativeTime(iso: string | null | undefined): string {
  const { t } = useTranslation("dashboard");

  return useMemo(() => {
    if (!iso) return "";
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return t("ticketCard.timeJustNow");
    if (diffMin < 60) return t("ticketCard.timeMinutes_other", { count: diffMin });

    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return t("ticketCard.timeHours_other", { count: diffH });

    const diffD = Math.floor(diffH / 24);
    return t("ticketCard.timeDays_other", { count: diffD });
  }, [iso, t]);
}

// ---------------------------------------------------------------------------
// TicketCard
// ---------------------------------------------------------------------------

export interface TicketCardProps {
  ticket: Ticket;
  selected: boolean;
  onSelect: (id: string) => void;
  onGroup?: (id: string) => void;
  onEscalate?: (id: string) => void;
  isCorrected?: boolean;
}

export function TicketCard({
  ticket,
  selected,
  onSelect,
  onGroup,
  onEscalate,
  isCorrected = false,
}: TicketCardProps) {
  const { t } = useTranslation("dashboard");
  const [hovered, setHovered] = useState(false);

  const isSpam = (ticket.ticket_type ?? "").toLowerCase() === "spam";
  const relativeTime = useRelativeTime(ticket.received_at ?? ticket.created_at);

  return (
    <button
      onClick={() => onSelect(ticket.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        padding: "12px 14px 12px 18px",
        borderBottom: "1px solid var(--k-border-subtle)",
        background: selected
          ? "var(--k-surface-2)"
          : hovered
          ? "var(--k-surface)"
          : "transparent",
        borderLeft: selected
          ? "2px solid var(--k-accent)"
          : "2px solid transparent",
        cursor: "pointer",
        opacity: isSpam ? 0.55 : 1,
        textAlign: "left",
        transition: "background 0.1s ease",
      }}
      aria-selected={selected}
    >
      {/* Priority stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 8,
          bottom: 8,
          width: 3,
          background: stripeColor(ticket.sentiment),
          borderRadius: "0 2px 2px 0",
        }}
      />

      {/* Row 1: priority + type + corrected + time */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <PriorityBadge priority={ticket.priority} />
        {ticket.ticket_type && (
          <span
            style={{
              ...typeBadgeStyle(ticket.ticket_type),
              fontSize: 11,
              fontFamily: "var(--k-font-mono)",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            {typeLabel(ticket.ticket_type)}
          </span>
        )}
        {isCorrected && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
              background: "#FEF3C7",
              color: "#B45309",
            }}
          >
            {t("correction.correctedBadge")}
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontFamily: "var(--k-font-mono)",
            color: "var(--k-text-tertiary)",
          }}
        >
          {relativeTime}
        </span>
      </div>

      {/* Row 2: subject */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--k-text-primary)",
          marginBottom: 4,
          lineHeight: 1.35,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {ticket.subject}
      </div>

      {/* Row 3: from + confidence dot */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--k-text-secondary)",
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ticket.from_name ?? ticket.from_email ?? "Unknown"}
        </span>

        {ticket.classification_confidence !== null &&
          ticket.classification_confidence !== undefined && (
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background:
                    ticket.classification_confidence > 0.9
                      ? "#10B981"
                      : ticket.classification_confidence > 0.7
                      ? "#F59E0B"
                      : "#EF4444",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--k-font-mono)",
                  fontSize: 11,
                  color: "var(--k-text-tertiary)",
                }}
              >
                {ticket.classification_confidence.toFixed(2)}
              </span>
            </div>
          )}
      </div>

      {/* Row 4: ticket number + SLA + group indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 6,
        }}
      >
        {ticket.ticket_number && (
          <span
            style={{
              fontSize: 10,
              color: "var(--k-text-tertiary)",
              fontFamily: "var(--k-font-mono)",
            }}
          >
            #{ticket.ticket_number}
          </span>
        )}
        <SlaBadge slaDate={ticket.sla_due_at} />
        {ticket.group_id && (
          <Users
            style={{ width: 12, height: 12, color: "var(--k-text-tertiary)", flexShrink: 0 }}
            aria-label="In group"
          />
        )}
      </div>

      {/* Hover quick actions */}
      {hovered && (onGroup || onEscalate) && (
        <div
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {onGroup && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGroup(ticket.id);
              }}
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 4,
                background: "white",
                border: "1px solid var(--k-border)",
                color: "var(--k-text-secondary)",
                boxShadow: "0 1px 2px rgba(9,9,11,0.04)",
                cursor: "pointer",
              }}
            >
              {t("ticketCard.group")}
            </button>
          )}
          {onEscalate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEscalate(ticket.id);
              }}
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 4,
                background: "white",
                border: "1px solid var(--k-border)",
                color: "var(--k-text-secondary)",
                boxShadow: "0 1px 2px rgba(9,9,11,0.04)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <ArrowUp style={{ width: 10, height: 10 }} />
              {t("ticketCard.escalate")}
            </button>
          )}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// All-states documentation (replaces Storybook — no Storybook in this project)
//
// Semaphore order: aggressive → frustrated → neutral → positive
// (urgent → neutral → casual/positive) — from most to least critical.
//
// State 1 — urgent sentiment (most critical)
//   sentiment="urgent"/"aggressive"/"frustrated" → RED stripe
//   priority="P1" → red badge
//   ticket_type="support" → SOPORTE badge (blue)
//   selected = true → var(--k-surface-2) bg + 2px solid var(--k-accent) left border
//
// State 2 — neutral sentiment
//   sentiment="neutral" → AMBER stripe
//   priority="P2" → orange badge
//   ticket_type="lead" → LEAD badge (green)
//
// State 3 — positive/casual (least critical)
//   sentiment="positive"/"casual" → GREEN stripe
//   priority="P3" → amber badge
//   ticket_type="spam" → SPAM badge (gray), opacity 0.55
//
// State 4 — null / unknown (silent fallback — must never throw)
//   sentiment = null | undefined | any unrecognized string
//   → green stripe (fallback), no priority badge if null
// ---------------------------------------------------------------------------
