import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ticket } from "@kairo/types";
import { computeTicketOperationalSla } from "@kairo/types";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { SlaBadge } from "@/components/sla-badge";
import { TICKET_GROUPING_ENABLED } from "@/lib/feature-flags";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { normalizeTicketType } from "@/lib/ticket-labels";
import { Box, CategoryChip, Icon, PlainInput, Pressable, PriorityGlyph, Text, type TextProps } from "@kairo/ui";

const NO_NOTE_COUNTS = { notes: 0, unread_mentions: 0 } as const;

// ---------------------------------------------------------------------------
// Sentiment helpers — stripe colors come from the sentiment scale of
// @kairo/tokens; the emoji is the indicator the design specifies.
// ---------------------------------------------------------------------------

const STRIPE_COLOR: Record<string, string> = {
  aggressive: "var(--kairo-sentiment-aggressive)",
  frustrated: "var(--kairo-sentiment-frustrated)",
  neutral:    "var(--kairo-sentiment-neutral)",
  positive:   "var(--kairo-sentiment-positive)",
};

const EMOTION_EMOJI: Record<string, string> = {
  aggressive: "🤬",
  frustrated: "😩",
  neutral:    "😐",
  positive:   "😊",
};

function stripeColor(sentiment: string | null | undefined): string {
  return STRIPE_COLOR[(sentiment ?? "").toLowerCase()] ?? "var(--kairo-color-line-strong)";
}

const EMOTION_LABEL_KEY = {
  aggressive: "ticketCard.emotionAggressive",
  frustrated: "ticketCard.emotionFrustrated",
  neutral:    "ticketCard.emotionNeutral",
  positive:   "ticketCard.emotionPositive",
} as const satisfies Record<string, string>;

// ---------------------------------------------------------------------------
// KAI-168 — operational SLA (by ticket priority) badge.
// Own domain from the contractual SlaBadge above (sla_due_at/plan-tier) — this
// one is computed client-side (computeTicketOperationalSla) from the ticket's
// own priority (P1/P2/P3) + received_at, since tickets arrive raw from
// Supabase (direct fetch + realtime), never pre-enriched by the API. Only
// this badge's background/text color changes per state; no stripe or other
// existing element is touched.
// ---------------------------------------------------------------------------

const PRIORITY_SLA_STYLE: Record<"ok" | "at_risk" | "breached", TextProps> = {
  ok:       { backgroundColor: "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)", color: "var(--kairo-color-ok-ink)" },
  at_risk:  { backgroundColor: "color-mix(in srgb, var(--kairo-color-mood) 8%, transparent)", color: "var(--kairo-color-sla-escalate-ink)" },
  breached: { backgroundColor: "var(--kairo-color-bad-soft)", color: "var(--kairo-color-bad-ink)" },
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
    <Text {...PRIORITY_SLA_STYLE[sla.status]} fontSize={10} fontWeight={600} paddingVertical={2} paddingHorizontal={6} borderRadius={4} whiteSpace="nowrap" flexShrink={0} title={t("prioritySla.tooltip", "ANS operativo según la prioridad del ticket")}>
      {label}
    </Text>
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
  // KAI-25 — historical context trigger. The parent list fetches related
  // history once per selected ticket and only tells the SELECTED card
  // whether it has any, so no per-card fetch (no N+1) ever happens here.
  hasRelatedHistory?: boolean;
  onOpenHistory?: (id: string) => void;
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
  hasRelatedHistory = false,
  onOpenHistory,
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

  // KAI-232 — note/mention counters for this row, from the shared store.
  const noteCounts = useTriageStore((s) => s.noteCounts[ticket.id]) ?? NO_NOTE_COUNTS;

  const isSpam = (ticket.ticket_type ?? "").toLowerCase() === "spam";
  const relativeTime = useRelativeTime(ticket.received_at ?? ticket.created_at);
  const emoji = EMOTION_EMOJI[(ticket.sentiment ?? "").toLowerCase()] ?? "";
  const emotionKey = (ticket.sentiment ?? "").toLowerCase() as keyof typeof EMOTION_LABEL_KEY;
  const emotionLabel = EMOTION_LABEL_KEY[emotionKey] ? t(EMOTION_LABEL_KEY[emotionKey]) : "";

  return (
    <Pressable onClick={() => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        onSelect(ticket.id);
      }} onPointerDown={handlePointerDown} onPointerUp={clearLongPressTimer} onPointerLeave={clearLongPressTimer} onPointerCancel={clearLongPressTimer} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} aria-selected={selected} position="relative" display="flex" flexDirection="column" width="100%" paddingTop={12} paddingRight={14} paddingBottom={12} paddingLeft={18} borderBottomWidth={1} borderBottomColor="var(--k-border-subtle)" backgroundColor={selected
          ? "var(--k-surface-2)"
          : hovered
          ? "var(--k-surface)"
          : "transparent"} borderLeftWidth={2} borderLeftColor={selected ? "var(--k-accent)" : "transparent"} cursor="pointer" opacity={isSpam ? 0.55 : 1} textAlign="left" transition="background 0.1s ease" borderStyle="solid">
      {/* Priority stripe */}
      <Box position="absolute" left={0} top={8} bottom={8} width={3} backgroundColor={stripeColor(ticket.sentiment)} borderTopLeftRadius={0} borderTopRightRadius={2} borderBottomRightRadius={2} borderBottomLeftRadius={0} />

      {/* Row 1: ticket ID + priority + type + corrected + time */}
      <Box display="flex" alignItems="center" gap={6} marginBottom={8} flexWrap="wrap">
        {onToggleSelect && (
          <Text width={14} display="inline-flex" alignItems="center" flexShrink={0}>
            {(hovered || multiSelectMode || isChecked) && (
              <PlainInput type="checkbox" checked={isChecked} aria-label={t("ticketCard.selectForGrouping", "Seleccionar para agrupar")} onClick={(e) => e.stopPropagation()} onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(ticket.id);
                }} width={13} height={13} cursor="pointer" />
            )}
          </Text>
        )}
        {ticket.ticket_number && (
          <Text fontSize={11} font="mono" color="var(--k-text-primary)" fontWeight={700} letterSpacing={0.22}>
            KAI-{ticket.ticket_number}
          </Text>
        )}
        <PriorityGlyph priority={ticket.priority} size={12} />
        {/* KAI-232 — internal notes on this ticket (amber chip) and a blue dot
            when one of them holds an unread mention of you (spec A1). Counts
            come from the store, computed server-side per request. */}
        {INTERNAL_NOTES_ENABLED && noteCounts.notes > 0 && (
          <Text title={t("notes.queueChipTooltip", "Internal notes on this ticket")} display="inline-flex" alignItems="center" gap={3} paddingVertical={1} paddingHorizontal={5} borderRadius={3} backgroundColor="var(--k-note-bg)" borderWidth={1} borderColor="var(--k-note-border)" color="var(--k-note-label)" font="mono" fontSize={9.5} borderStyle="solid">
            <Icon name="lock" size={8} />
            {noteCounts.notes}
          </Text>
        )}
        {INTERNAL_NOTES_ENABLED && noteCounts.unread_mentions > 0 && (
          <Text title={t("notes.queueMentionTooltip", "You have an unread mention here")} width={5} height={5} borderRadius={999} backgroundColor="var(--k-mention-solid)" flexShrink={0} />
        )}
        {ticket.ticket_type && (
          <CategoryChip
            scale="ticketType"
            value={normalizeTicketType(ticket.ticket_type)}
            label={t(`ticketTypes.${normalizeTicketType(ticket.ticket_type)}`)}
            size="sm"
          />
        )}
        {isCorrected && (
          <Text fontSize={10} fontWeight={600} paddingVertical={2} paddingHorizontal={6} borderRadius={4} backgroundColor="var(--kairo-color-note-soft)" color="var(--kairo-color-note)">
            {t("correction.correctedBadge")}
          </Text>
        )}
        <Text marginLeft="auto" fontSize={10} font="mono" color="var(--k-text-tertiary)">
          {relativeTime}
        </Text>
      </Box>

      {/* Row 2: subject */}
      <Text tag="div" fontSize={12} fontWeight={500} color="var(--k-text-primary)" marginBottom={8} lineHeight={16.2} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" display="block">
        {ticket.subject}
      </Text>

      {/* Row 3: sentiment emoji + name | priority score + confidence */}
      <Text tag="div" display="flex" alignItems="center" gap={6} fontSize={12} color="var(--k-text-secondary)">
        {emoji && (
          <Text aria-label={emotionLabel} title={emotionLabel} fontSize={13} flexShrink={0} lineHeight={13}>
            {emoji}
          </Text>
        )}
        <Text flexGrow={1} flexShrink={1} flexBasis="0%" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {ticket.from_name ?? ticket.from_email ?? "Unknown"}
        </Text>
      </Text>

      {/* Row 4: SLA + grouped badge + priority score/confidence (ticket number moved to Row 1) */}
      <Box display="flex" alignItems="center" gap={6} marginTop={6}>
        <SlaBadge slaDate={ticket.sla_due_at} />
        {TICKET_GROUPING_ENABLED && ticket.group_id && groupCount > 1 && (
          <Text title={t("ticketCard.groupedTooltip", { count: groupCount - 1 })} display="flex" alignItems="center" gap={4} fontSize={10} color="var(--k-text-tertiary)" paddingVertical={2} paddingHorizontal={7} borderRadius={4} borderWidth={1} borderColor="var(--k-border)" font="mono" whiteSpace="nowrap" flexShrink={0} borderStyle="dashed">
            <Icon name="clients" size={10} />+ {groupCount - 1}
          </Text>
        )}
        {TICKET_GROUPING_ENABLED && ticket.group_id && groupCount <= 1 && (
          <Text title={t("ticketCard.groupedAloneTooltip", "Este ticket pertenece a un grupo")} display="inline-flex" flexShrink={0}>
            <Icon name="clients" size={12} color="var(--k-text-tertiary)" />
          </Text>
        )}

        <Box marginLeft="auto" flexShrink={0} display="flex" alignItems="center" gap={6}>
          <PrioritySlaBadge ticket={ticket} />
          {ticket.priority_score !== null && ticket.priority_score !== undefined && (
            <Text title={t("ticketCard.priorityScoreTooltip", "Peso de prioridad")} font="mono" fontSize={10} fontWeight={600} paddingVertical={1} paddingHorizontal={5} borderRadius={4} backgroundColor="var(--k-surface-2)" color="var(--k-text-tertiary)">
              {Math.round(ticket.priority_score)}
            </Text>
          )}
          {ticket.classification_confidence !== null &&
            ticket.classification_confidence !== undefined && (
              <Text title={t("ticketCard.confidenceTooltip", "Confianza de la clasificación IA (0.00–1.00)")} font="mono" fontSize={10} color="var(--k-text-tertiary)">
                {ticket.classification_confidence.toFixed(2)}
              </Text>
            )}
        </Box>
      </Box>

      {/* KAI-25 — historical context trigger (selected card only, when related history exists) */}
      {selected && hasRelatedHistory && onOpenHistory && (
        <Box marginTop={6}>
          <Pressable onClick={(e) => {
              e.stopPropagation();
              onOpenHistory(ticket.id);
            }} fontSize={11} fontWeight={500} color="var(--k-accent)" backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={0} textAlign="left" textDecoration="underline" textUnderlineOffset={2}>
            {t("ticketCard.viewRelatedHistory")}
          </Pressable>
        </Box>
      )}

      {/* Hover quick actions */}
      {hovered && (onGroup || onEscalate) && (
        <Box position="absolute" right={8} top={8} display="flex" alignItems="center" gap={4}>
          {onGroup && (
            <Pressable onClick={(e) => {
                e.stopPropagation();
                onGroup(ticket.id);
              }} fontSize={10} fontWeight={500} paddingVertical={2} paddingHorizontal={6} borderRadius={4} backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" color="var(--k-text-secondary)" boxShadow="0 1px 2px rgba(9,9,11,0.04)" cursor="pointer" borderStyle="solid">
              {t("ticketCard.group")}
            </Pressable>
          )}
          {onEscalate && (
            <Pressable onClick={(e) => {
                e.stopPropagation();
                onEscalate(ticket.id);
              }} fontSize={10} fontWeight={500} paddingVertical={2} paddingHorizontal={6} borderRadius={4} backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" color="var(--k-text-secondary)" boxShadow="0 1px 2px rgba(9,9,11,0.04)" cursor="pointer" display="flex" alignItems="center" gap={3} borderStyle="solid">
              <Icon name="escalate" size={10} />
              {t("ticketCard.escalate")}
            </Pressable>
          )}
        </Box>
      )}
    </Pressable>
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
