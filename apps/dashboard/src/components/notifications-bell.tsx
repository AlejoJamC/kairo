// Notification bell + activity popover, in the sidebar header.

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "@kairo/client-core/endpoints";
import { fetchTicketById } from "@kairo/client-core/queries";
import { getNumericFlag } from "@/lib/feature-flags";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { Avatar, Box, Button, EmptyState, NotificationRow, Popover, PopoverContent, PopoverTrigger, Segmented, SidebarBell, Text } from "@kairo/ui";
import type { AppView } from "@/types";

// KAI-232 — how often the bell re-fetches /api/v1/notifications, in seconds.
// ADR-025 §4 chose polling (ADR-010 Tier 2) over Realtime for the bell.
const NOTIFICATIONS_POLL_INTERVAL_SECONDS = getNumericFlag(
  import.meta.env.VITE_FF_NOTIFICATIONS_POLL_INTERVAL_SECONDS,
  30
);

const T = {
  surface:      "var(--k-surface)",
  borderSubtle: "var(--k-border-subtle)",
  textPrimary:  "var(--k-text-primary)",
  textTertiary: "var(--k-text-tertiary)",
  accent:       "var(--k-accent)",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Notifications data + helpers
// ─────────────────────────────────────────────────────────────────────────────
interface NotifItem {
  id: string;
  kind: "mention" | "escalation" | "assigned" | "ai" | "reply" | "report" | "system" | "sla_escalation";
  unread: boolean;
  who: string;
  actor: string;
  actorBg: string;
  actorColor?: string;
  title: string;
  target: string | null;
  preview: string;
  time: string;
  // KAI-232 — deep-link target for mention rows: open this ticket and scroll
  // the thread to this note. Null on every other kind.
  ticketId: string | null;
  ticketEventId: string | null;
}

// KAI-168 — API notification row (apps/api/src/routes/v1/notifications.ts).
interface ApiNotification {
  id: string;
  kind: string;
  ticket_id: string | null;
  /** KAI-232 — note-level deep-link (nullable; only mention rows carry it). */
  ticket_event_id: string | null;
  /** KAI-232 — ticket reference for the row's mono chip. */
  ticket_short_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

function relativeTimeShort(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return `${Math.floor(diffH / 24)}d`;
}

// Producers: the SLA escalation cron (KAI-168) and the internal-note mention
// fan-out (KAI-232). Every unrecognized/future `kind` still maps to a neutral
// "system" style rather than throwing.
//
// KAI-232: with the internal-notes flag OFF, a mention row is deliberately
// degraded to a plain "system" item — visible but not labelled as a mention
// and not clickable — so no internal-notes surface leaks through the bell.
function toNotifItem(row: ApiNotification): NotifItem {
  const isEscalation = row.kind === "sla_escalation";
  const isMention = INTERNAL_NOTES_ENABLED && row.kind === "mention";

  if (isMention) {
    return {
      id: row.id,
      kind: "mention",
      unread: !row.read_at,
      // `title` carries only the author's name; the sentence and the ticket
      // chip are composed in NotifRow from the i18n catalog (KAI-232).
      who: row.title,
      actor: "@",
      actorBg: "var(--k-accent-subtle)",
      actorColor: "var(--k-accent)",
      title: "",
      target: row.ticket_short_id,
      preview: row.body,
      time: relativeTimeShort(row.created_at),
      ticketId: row.ticket_id,
      ticketEventId: row.ticket_event_id,
    };
  }

  return {
    id: row.id,
    kind: isEscalation ? "escalation" : "system",
    unread: !row.read_at,
    who: isEscalation ? "Sistema" : row.title,
    actor: isEscalation ? "!" : "S",
    actorBg: isEscalation ? "var(--kairo-color-bad-soft)" : "var(--kairo-color-text)",
    actorColor: isEscalation ? "var(--kairo-color-bad-ink)" : "white",
    title: isEscalation ? "generó una escalación de ANS" : "",
    target: null,
    preview: row.body,
    time: relativeTimeShort(row.created_at),
    ticketId: null,
    ticketEventId: null,
  };
}

const NOTIF_DOT_COLOR: Record<NotifItem["kind"], string> = {
  escalation: "var(--kairo-color-bad)",
  mention:    "var(--k-accent)",
  assigned:   "var(--kairo-color-warn)",
  ai:         "var(--k-accent)",
  reply:      "var(--kairo-color-ok)",
  report:     "var(--k-text-tertiary)",
  system:     "var(--k-text-tertiary)",
  sla_escalation: "var(--kairo-color-bad)",
};


// ─────────────────────────────────────────────────────────────────────────────
// Notifications Popover
// ─────────────────────────────────────────────────────────────────────────────
interface NotifPopoverProps {
  items: NotifItem[];
  onMarkAll: () => void;
  onSelect: (item: NotifItem) => void;
}

function NotificationsPopover({ items, onMarkAll, onSelect }: NotifPopoverProps) {
  const { t } = useTranslation(["dashboard"]);
  const [tab, setTab] = useState<"todas" | "menciones">("todas");

  const filtered =
    tab === "menciones" ? items.filter((n) => n.kind === "mention") :
    items;

  const unread = items.filter((n) => n.unread).length;
  const unreadMentions = items.filter((n) => n.unread && n.kind === "mention").length;

  // KAI-232: the "@menciones" tab only exists when internal notes are on —
  // otherwise it could never hold anything but would still advertise the feature.
  const TABS: [string, string][] = [
    ["todas",      t("dashboard:topChrome.notifications.tabAll")],
    ...(INTERNAL_NOTES_ENABLED
      ? ([["menciones", t("dashboard:topChrome.notifications.tabMentions")]] as [string, string][])
      : []),
  ];

  return (
    <Box width={380} overflow="hidden" borderRadius={11}>
      {/* Header */}
      <Box paddingTop={12} paddingHorizontal={14} paddingBottom={8} borderBottomWidth={1} borderBottomColor={T.borderSubtle} borderStyle="solid">
        <Box display="flex" alignItems="center" justifyContent="space-between" marginBottom={8}>
          <Box display="flex" alignItems="baseline" gap={8}>
            <Text fontSize={15} fontWeight={600} letterSpacing={-0.15} color={T.textPrimary}>
              {t("dashboard:topChrome.notifications.title")}
            </Text>
            <Text fontSize={11} font="mono" color={T.textTertiary}>
              {t("dashboard:topChrome.notifications.unreadCount", { count: unread })}
            </Text>
          </Box>
          <Button size="sm" onPress={onMarkAll}>{t("dashboard:topChrome.notifications.markRead")}</Button>
        </Box>
        {/* Tabs */}
        <Segmented
          label={t("dashboard:topChrome.notifications.title")}
          value={tab}
          onChange={setTab}
          items={TABS.map(([id, label]) => ({ value: id as typeof tab, label, count: id === "menciones" && unreadMentions > 0 ? unreadMentions : undefined }))}
        />
      </Box>

      {/* List */}
      <Box maxHeight={420} scroll>
        {filtered.length === 0 && (
          <EmptyState title={t("dashboard:topChrome.notifications.empty")} paddingVertical={40} />
        )}
        {filtered.map((n) => (
          <NotifRow key={n.id} n={n} onSelect={onSelect} />
        ))}
      </Box>

    </Box>
  );
}

/** "Johana Ferrer" → "Johana" — the row leads with a first name (spec D1). */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

function NotifRow({ n, onSelect }: { n: NotifItem; onSelect: (item: NotifItem) => void }) {
  const { t } = useTranslation(["dashboard"]);
  if (n.kind === "mention") {
    return (
      <NotificationRow
        variant="mention"
        avatar={<Avatar name={n.who} seed={n.who} size={26} />}
        text={
          <>
            <Text tag="strong" fontWeight={n.unread ? 600 : 500}>{firstName(n.who)}</Text>{" "}
            {t("dashboard:notes.mentionedYouIn")}
            {n.target && <Text font="mono" color={T.accent} marginLeft={4}>{n.target}</Text>}
          </>
        }
        excerpt={n.preview}
        time={n.time}
        unread={n.unread}
        onPress={() => onSelect(n)}
      />
    );
  }
  return (
    <NotificationRow
      variant="activity"
      who={firstName(n.who)}
      what={n.title}
      target={n.target ?? undefined}
      time={n.time}
      unread={n.unread}
      dotColor={NOTIF_DOT_COLOR[n.kind]}
      onPress={() => onSelect(n)}
    />
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// NotificationsBell — trigger + popover + polling
// ─────────────────────────────────────────────────────────────────────────────
interface NotificationsBellProps {
  onViewChange: (view: AppView) => void;
}

export function NotificationsBell({ onViewChange }: NotificationsBellProps) {
  const { t } = useTranslation(["dashboard"]);
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);

  // KAI-168 — real in-app notifications (SLA escalations + KAI-232 mentions).
  // KAI-232: polled rather than fetched once, so a mention reaches the bell
  // within the interval (ADR-025 §4 — polling, not Realtime).
  useEffect(() => {
    let cancelled = false;

    function load() {
      getNotifications()
        .then((res) => res.json())
        .then((body: { data: ApiNotification[] }) => {
          if (!cancelled) setNotifs(body.data.map(toNotifItem));
        })
        .catch(() => {});
    }

    load();
    const timer = setInterval(load, NOTIFICATIONS_POLL_INTERVAL_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const unread = notifs.filter((n) => n.unread).length;
  const unreadMentions = notifs.filter((n) => n.unread && n.kind === "mention").length;

  function markRead(id: string) {
    setNotifs((ns) => ns.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    // Also stamps ticket_note_mentions.read_at server-side for mentions.
    markNotificationRead(id).catch(() => {});
  }

  // KAI-232 (design rule F.2): a bulk dismiss clears NOTIFICATIONS only — the
  // note cards stay unread until actually read in the Notes tab. That is why
  // this hits /read-all (no mention cascade) instead of N per-id PATCHes.
  function markAllRead() {
    setNotifs((ns) => ns.map((n) => ({ ...n, unread: false })));
    markAllNotificationsRead().catch(() => {});
  }

  // KAI-232 — mention deep-link: mark read, open triage on that ticket, and
  // ask the center thread to scroll to the exact note (ADR-011 cross-panel
  // signal). The ticket may not be in the triage list (the list excludes
  // awaiting_customer/resolved), so fetch and upsert it before selecting.
  async function handleSelect(item: NotifItem) {
    setOpen(false);
    markRead(item.id);
    if (!item.ticketId) return;

    const { selectTicket, requestScrollToMessage, upsertTicket, tickets } =
      useTriageStore.getState();

    if (!tickets.some((entry) => entry.id === item.ticketId)) {
      const ticket = await fetchTicketById(item.ticketId);
      if (ticket) upsertTicket(ticket);
    }

    onViewChange("triage");
    selectTicket(item.ticketId);
    if (item.ticketEventId) requestScrollToMessage(item.ticketEventId);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        {/* KAI-232 spec D5 — the count covers ALL unread notifications; the
            dot only hints that mentions are among them. */}
        <SidebarBell
          label={t("dashboard:topChrome.palette.notifications")}
          unreadLabel={t("dashboard:topChrome.notifications.unreadCount", { count: unread })}
          count={unread}
          hasMention={unreadMentions > 0}
          open={open}
        />
      </PopoverTrigger>
      <PopoverContent label={t("dashboard:topChrome.notifications.title")} side="bottom" align="start">
        <NotificationsPopover items={notifs} onMarkAll={markAllRead} onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}
