import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, ArrowUp, Mail } from "lucide-react";
import { getEmotionTokens } from "@kairo/ui";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// Channel icon
// ---------------------------------------------------------------------------

function ChannelIcon({ channel }: { channel: string }) {
  const lower = channel.toLowerCase();
  if (lower === "whatsapp") {
    return (
      <span className="text-[10px] font-bold text-green-600" title="WhatsApp">
        WA
      </span>
    );
  }
  // email and any other channel
  return <Mail className="h-3 w-3 text-zinc-400" aria-label={channel} />;
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
      return {
        text: t("ticketCard.slaHours_other", { count: hours, minutes }),
        breached: false,
      };
    }
    return {
      text: t("ticketCard.slaMinutes_other", { count: totalMinutes }),
      breached: false,
    };
  }, [slaDate, t]);

  if (!label) return null;

  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        label.breached
          ? "bg-red-100 text-red-700"
          : "bg-zinc-100 text-zinc-600"
      }`}
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

  const emotion = getEmotionTokens(ticket.emotion);
  const relativeTime = useRelativeTime(ticket.received_at ?? ticket.created_at);

  // Avatar initials from name or email
  const initials = useMemo(() => {
    const name = ticket.from_name ?? ticket.from_email ?? "?";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }, [ticket.from_name, ticket.from_email]);

  return (
    <button
      onClick={() => onSelect(ticket.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={[
        "relative flex w-full flex-col border-b border-l-4 px-3 py-2.5 text-left transition-colors duration-150",
        emotion.cardBorder,
        selected
          ? "bg-zinc-50"
          : hovered
          ? "bg-gray-50"
          : emotion.cardBg,
      ].join(" ")}
      aria-selected={selected}
    >
      {/* Row 1: avatar + name + emotion emoji + channel + group indicator */}
      <div className="flex items-center gap-2">
        {/* Avatar */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600">
          {initials}
        </div>

        {/* Name + emoji */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
          {emotion.emoji && (
            <span className="mr-1" role="img" aria-label={emotion.ariaLabel}>
              {emotion.emoji}
            </span>
          )}
          {ticket.from_name ?? ticket.from_email ?? "Unknown"}
        </span>

        {/* Channel icon */}
        <ChannelIcon channel={ticket.channel} />

        {/* Group indicator */}
        {ticket.group_id && (
          <Users className="h-3 w-3 shrink-0 text-zinc-400" aria-label="In group" />
        )}
      </div>

      {/* Row 2: subject */}
      <p className="mt-1 truncate pl-8 text-xs text-zinc-700">{ticket.subject}</p>

      {/* Row 3: snippet */}
      {ticket.snippet && (
        <p className="mt-0.5 line-clamp-1 pl-8 text-xs text-zinc-400">
          {ticket.snippet}
        </p>
      )}

      {/* Row 4: ticket number + SLA + timestamp + corrected badge */}
      <div className="mt-1.5 flex items-center justify-between pl-8">
        <span className="text-[10px] text-zinc-400">#{ticket.ticket_number}</span>
        <div className="flex items-center gap-1.5">
          {isCorrected && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {t("correction.correctedBadge")}
            </span>
          )}
          <SlaBadge slaDate={ticket.sla_due_at} />
          <span className="text-[10px] text-zinc-400">{relativeTime}</span>
        </div>
      </div>

      {/* Hover quick actions */}
      {hovered && (
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {onGroup && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGroup(ticket.id);
              }}
              className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50"
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
              className="flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              <ArrowUp className="h-2.5 w-2.5" />
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
// (🤬 → 😩 → 😐 → 😊) — from most to least critical. Never invert.
//
// State 1 — aggressive (most critical)
//   emotion="aggressive" → 🤬 RED border + bg-red-50
//   sla_due_at = future → "2h 15m" badge
//   group_id = "abc"    → Users icon shown
//   selected = true     → bg-zinc-50
//
// State 2 — frustrated
//   emotion="frustrated" → 😩 ORANGE border + bg-orange-50
//   sla_due_at = past   → "VENCIDO" red badge
//   group_id = null     → no group icon
//   hovered = true      → quick action buttons (Group, Escalate) visible
//
// State 3 — neutral
//   emotion="neutral" → 😐 BLUE border, transparent bg
//   sla_due_at = null → no SLA badge rendered
//
// State 4 — positive (least critical)
//   emotion="positive" → 😊 GREEN border, transparent bg
//
// State 5 — null / unknown (silent fallback — must never throw)
//   emotion = null | undefined | any unrecognized string
//   → zinc border, no emoji, no tinted bg
//   Renders normally, no error, no visual disruption
// ---------------------------------------------------------------------------
