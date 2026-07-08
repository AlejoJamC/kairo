import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, ArrowUp } from "lucide-react";
import type { Ticket } from "@kairo/types";
import { computeTicketOperationalSla } from "@kairo/types";
import { getEmotionTokens } from "@kairo/ui";
import { useTriageStore } from "@/stores/triage-store";

// ---------------------------------------------------------------------------
// Sentiment helpers — sourced from @kairo/ui triage-tokens
// aggressive(🤬red) → frustrated(😩orange) → neutral(😐blue) → positive(😊green)
// ---------------------------------------------------------------------------

const STRIPE_COLOR: Record<string, string> = {
  aggressive: "#EF4444",
  frustrated: "#F97316",
  neutral:    "#60A5FA",
  positive:   "#10B981",
};

function stripeColor(sentiment: string | null | undefined): string {
  return STRIPE_COLOR[(sentiment ?? "").toLowerCase()] ?? "#D4D4D8";
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
// KAI-168 — operational SLA (by ticket priority) badge.
// Own domain from the contractual SlaBadge above (sla_due_at/plan-tier) — this
// one is computed client-side (computeTicketOperationalSla) from the ticket's
// own priority (P1/P2/P3) + received_at, since tickets arrive raw from
// Supabase (direct fetch + realtime), never pre-enriched by the API. Only
// this badge's background/text color changes per state; no stripe or other
// existing element is touched.
// ---------------------------------------------------------------------------

const PRIORITY_SLA_STYLE: Record<"ok" | "at_risk" | "breached", React.CSSProperties> = {
  ok:       { background: "#ECFDF5", color: "#047857" },
  at_risk:  { background: "#FFF7ED", color: "#C2410C" },
  breached: { background: "#FEF2F2", color: "#DC2626" },
};

function PrioritySlaBadge({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation("dashboard");
  const config = useTriageStore((s) => s.operationalSlaConfig);
  const sla = useMemo(() => computeTicketOperationalSla(ticket, config), [ticket, config]);
  if (!sla) return null;

  const hours = Math.floor((sla.status === "breached" ? sla.overdueSeconds : sla.remainingSeconds) / 3600);
  const minutes = Math.floor((sla.status === "breached" ? sla.overdueSeconds : sla.remainingSeconds) / 60);
  const days = Math.floor((sla.status === "breached" ? sla.overdueSeconds : sla.remainingSeconds) / 86400);

  let label: string;
  if (sla.status === "ok") {
    label = hours > 0 ? t("prioritySla.remainingHours", { count: hours }) : t("prioritySla.remainingMinutes", { count: minutes });
  } else if (sla.status === "at_risk") {
    label = hours > 0 ? t("prioritySla.dueInHours", { count: hours }) : t("prioritySla.dueInMinutes", { count: minutes });
  } else {
    label = days > 0 ? t("prioritySla.overdueDays", { count: days }) : t("prioritySla.overdueHours", { count: hours });
  }

  return (
    <span
      style={{
        ...PRIORITY_SLA_STYLE[sla.status],
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 4,
      }}
    >
      {label}
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

// KAI-24 — long-press duration (ms) before a press-and-hold on the card
// enters multi-select mode by toggling this card's checkbox.
const LONG_PRESS_MS = 500;

export interface TicketCardProps {
  ticket: Ticket;
  selected: boolean;
  onSelect: (id: string) => void;
  onGroup?: (id: string) => void;
  onEscalate?: (id: string) => void;
  isCorrected?: boolean;
  groupCount?: number;
  // KAI-24 — manual multi-select for grouping. All optional so existing
  // single-select callers/tests are unaffected.
  multiSelectMode?: boolean;
  isChecked?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function TicketCard({
  ticket,
  selected,
  onSelect,
  onGroup,
  onEscalate,
  isCorrected = false,
  groupCount = 0,
  multiSelectMode = false,
  isChecked = false,
  onToggleSelect,
}: TicketCardProps) {
  const { t } = useTranslation("dashboard");
  const [hovered, setHovered] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  function clearLongPressTimer() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerDown() {
    if (!onToggleSelect) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onToggleSelect(ticket.id);
    }, LONG_PRESS_MS);
  }

  const isSpam = (ticket.ticket_type ?? "").toLowerCase() === "spam";
  const relativeTime = useRelativeTime(ticket.received_at ?? ticket.created_at);
  const emotion = getEmotionTokens(ticket.sentiment);

  return (
    <button
      onClick={() => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        onSelect(ticket.id);
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
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

      {/* Row 1: ticket ID + priority + type + corrected + time */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        {onToggleSelect && (
          <span style={{ width: 14, display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
            {(hovered || multiSelectMode || isChecked) && (
              <input
                type="checkbox"
                checked={isChecked}
                aria-label={t("ticketCard.selectForGrouping", "Seleccionar para agrupar")}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(ticket.id);
                }}
                style={{ width: 13, height: 13, cursor: "pointer" }}
              />
            )}
          </span>
        )}
        {ticket.ticket_number && (
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--k-font-mono)",
              color: "var(--k-text-tertiary)",
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            KAI-{ticket.ticket_number}
          </span>
        )}
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
          marginBottom: 8,
          lineHeight: 1.35,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {ticket.subject}
      </div>

      {/* Row 3: sentiment emoji + name | priority score + confidence */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--k-text-secondary)",
        }}
      >
        {emotion.emoji && (
          <span
            style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}
            aria-label={emotion.ariaLabel}
          >
            {emotion.emoji}
          </span>
        )}
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
      </div>

      {/* Row 4: SLA + grouped badge + priority score/confidence (ticket number moved to Row 1) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 6,
        }}
      >
        <SlaBadge slaDate={ticket.sla_due_at} />
        <PrioritySlaBadge ticket={ticket} />
        {ticket.group_id && groupCount > 1 && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              color: "var(--k-text-tertiary)",
              padding: "2px 7px",
              borderRadius: 4,
              border: "1px dashed var(--k-border)",
              fontFamily: "var(--k-font-mono)",
            }}
          >
            <Users style={{ width: 10, height: 10, flexShrink: 0 }} />
            + {groupCount - 1} {t("ticketCard.similares", "similares agrupados")}
          </span>
        )}
        {ticket.group_id && groupCount <= 1 && (
          <Users
            style={{ width: 12, height: 12, color: "var(--k-text-tertiary)", flexShrink: 0 }}
          />
        )}

        <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {ticket.priority_score !== null && ticket.priority_score !== undefined && (
            <span
              style={{
                fontFamily: "var(--k-font-mono)",
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 5px",
                borderRadius: 4,
                background: "var(--k-surface-2)",
                color: "var(--k-text-tertiary)",
              }}
              title={t("ticketCard.priorityScoreTooltip", "Peso de prioridad")}
            >
              {Math.round(ticket.priority_score)}
            </span>
          )}
          {ticket.classification_confidence !== null &&
            ticket.classification_confidence !== undefined && (
              <span
                style={{
                  fontFamily: "var(--k-font-mono)",
                  fontSize: 11,
                  color: "var(--k-text-tertiary)",
                }}
              >
                {ticket.classification_confidence.toFixed(2)}
              </span>
            )}
        </div>
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
