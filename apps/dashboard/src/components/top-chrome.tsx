// Top chrome — 56 px header bar: logo/toggle | search | HeaderActions
// FIG 2.4 · Notificaciones popover
// FIG 2.5 · Cuenta popover

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "@kairo/client-core/endpoints";
import { fetchTicketById } from "@kairo/client-core/queries";
import { getNumericFlag } from "@/lib/feature-flags";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { Avatar, Box, EmptyState, Icon, Kbd, KbdGroup, Menu, MenuItem, NotificationRow, Popover, PopoverContent, PopoverTrigger, Pressable, PulseDot, Text, getInitials } from "@kairo/ui";
import type { AppView } from "@/types";

// KAI-232 — how often the bell re-fetches /api/v1/notifications, in seconds.
// ADR-025 §4 chose polling (ADR-010 Tier 2) over Realtime for the bell.
const NOTIFICATIONS_POLL_INTERVAL_SECONDS = getNumericFlag(
  import.meta.env.VITE_FF_NOTIFICATIONS_POLL_INTERVAL_SECONDS,
  30
);

// ─────────────────────────────────────────────────────────────────────────────
// Token shortcuts (keeps inline styles terse)
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  bg:           "var(--k-bg)",
  surface:      "var(--k-surface)",
  surface2:     "var(--k-surface-2)",
  border:       "var(--k-border)",
  borderSubtle: "var(--k-border-subtle)",
  textPrimary:  "var(--k-text-primary)",
  textSecondary:"var(--k-text-secondary)",
  textTertiary: "var(--k-text-tertiary)",
  accent:       "var(--k-accent)",
  accentSubtle: "var(--k-accent-subtle)",
  mono:         "var(--k-font-mono)",
  display:      "var(--k-font-display)",
  shadow:       "0 4px 24px rgba(9,9,11,.12), 0 1px 4px rgba(9,9,11,.07)",
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
  const [tab, setTab] = useState<"todas" | "no-leidas" | "menciones">("todas");

  const filtered =
    tab === "no-leidas" ? items.filter((n) => n.unread) :
    tab === "menciones" ? items.filter((n) => n.kind === "mention") :
    items;

  const unread = items.filter((n) => n.unread).length;
  const unreadMentions = items.filter((n) => n.unread && n.kind === "mention").length;

  // KAI-232: the "@menciones" tab only exists when internal notes are on —
  // otherwise it could never hold anything but would still advertise the feature.
  const TABS: [string, string][] = [
    ["todas",      t("dashboard:topChrome.notifications.tabAll")],
    ["no-leidas",  t("dashboard:topChrome.notifications.tabUnread")],
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
          <Pressable onClick={onMarkAll} fontSize={11} paddingVertical={4} paddingHorizontal={8} borderRadius={4} color={T.textSecondary} font="mono" borderWidth={1} borderColor={T.border} backgroundColor={T.bg} cursor="pointer" borderStyle="solid">
            {t("dashboard:topChrome.notifications.markRead")}
          </Pressable>
        </Box>
        {/* Tabs */}
        <Box display="flex" gap={4}>
          {TABS.map(([id, label]) => (
            <Pressable key={id} onClick={() => setTab(id as typeof tab)} display="inline-flex" alignItems="center" gap={5} fontSize={11} paddingVertical={4} paddingHorizontal={8} borderRadius={4} backgroundColor={tab === id ? T.surface2 : "transparent"} color={tab === id ? T.textPrimary : T.textTertiary} font="mono" borderWidth={0} cursor="pointer">
              {label}
              {/* Unread mentions pending on this tab (spec D1). */}
              {id === "menciones" && unreadMentions > 0 && (
                <Text width={5} height={5} borderRadius={999} backgroundColor="var(--k-mention-solid)" />
              )}
            </Pressable>
          ))}
        </Box>
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

      {/* Footer */}
      <Box paddingVertical={8} paddingHorizontal={14} borderTopWidth={1} borderTopColor={T.borderSubtle} backgroundColor={T.surface} display="flex" alignItems="center" justifyContent="space-between" borderStyle="solid">
        <Text fontSize={11} font="mono" color={T.textTertiary} display="flex" alignItems="center" gap={5}>
          <PulseDot width={5} height={5} backgroundColor="var(--kairo-color-ok)" />
          {t("dashboard:topChrome.notifications.liveStream")}
        </Text>
        <Pressable fontSize={12} color={T.accent} fontWeight={500} backgroundColor="transparent" borderWidth={0} cursor="pointer">
          {t("dashboard:topChrome.notifications.viewAll")}
        </Pressable>
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
// Profile / Account Popover
// ─────────────────────────────────────────────────────────────────────────────
type UserStatus = "online" | "busy" | "away" | "offline";

// Dots are semantic colors — not translated
const STATUS_DOTS: Record<UserStatus, string> = {
  online:  "var(--kairo-color-ok)",
  busy:    "var(--kairo-color-bad)",
  away:    "var(--kairo-color-warn)",
  offline: "var(--kairo-color-faint)",
};

type Theme = "light" | "auto" | "dark";

interface ProfilePopoverProps {
  initials: string;
  displayName: string;
  email: string;
  status: UserStatus;
  setStatus: (s: UserStatus) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
}

function ProfilePopover({
  initials, displayName, email,
  status, setStatus, theme, setTheme,
  onNavigate, onSignOut,
}: ProfilePopoverProps) {
  const { t } = useTranslation(["dashboard"]);

  const STATUS_OPTIONS: { id: UserStatus; label: string; dot: string }[] = [
    { id: "online",  label: t("dashboard:topChrome.account.statusOnline"),  dot: STATUS_DOTS.online },
    { id: "busy",    label: t("dashboard:topChrome.account.statusBusy"),    dot: STATUS_DOTS.busy },
    { id: "away",    label: t("dashboard:topChrome.account.statusAway"),    dot: STATUS_DOTS.away },
    { id: "offline", label: t("dashboard:topChrome.account.statusOffline"), dot: STATUS_DOTS.offline },
  ];

  const THEME_OPTIONS: [Theme, string][] = [
    ["light", t("dashboard:topChrome.account.themeLight")],
    ["auto",  t("dashboard:topChrome.account.themeAuto")],
    ["dark",  t("dashboard:topChrome.account.themeDark")],
  ];

  const cur = STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[0];

  const MENU_ITEMS: { icon: React.ReactNode; label: string; kbd: string | null; action: () => void }[] = [
    { icon: <Icon name="user" size={14} color={T.textTertiary} />,     label: t("dashboard:topChrome.account.menuProfile"),   kbd: null,  action: () => {} },
    { icon: <Icon name="settings" size={14} color={T.textTertiary} />, label: t("dashboard:topChrome.account.menuSettings"),  kbd: "⌘,",  action: () => onNavigate("settings") },
    { icon: <Icon name="zap" size={14} color={T.textTertiary} />,      label: t("dashboard:topChrome.account.menuShortcuts"), kbd: "⌘?",  action: () => {} },
    { icon: <Icon name="knowledge" size={14} color={T.textTertiary} />, label: t("dashboard:topChrome.account.menuDocs"),      kbd: null,  action: () => {} },
  ];

  return (
    <Box width={300} overflow="hidden" borderRadius={11}>
      {/* User card */}
      <Box padding={14} borderBottomWidth={1} borderBottomColor={T.borderSubtle} borderStyle="solid">
        <Box display="flex" gap={12} alignItems="center">
          <Box position="relative" flexShrink={0}>
            <Text tag="div" width={40} height={40} borderRadius={999} backgroundImage="linear-gradient(135deg, var(--k-accent) 0%, var(--kairo-color-accent-indigo) 100%)" color="white" fontSize={13} fontWeight={600} display="flex" alignItems="center" justifyContent="center">
              {initials}
            </Text>
            <Box position="absolute" bottom={-1} right={-1} width={12} height={12} borderRadius={999} backgroundColor={cur.dot} borderWidth={2} borderColor={T.bg} borderStyle="solid" />
          </Box>
          <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
            <Text tag="div" fontSize={13} fontWeight={500} color={T.textPrimary} display="block">{displayName}</Text>
            <Text tag="div" fontSize={12} color={T.textTertiary} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" display="block">
              {email}
            </Text>
            <Box display="inline-flex" alignItems="center" gap={4} marginTop={4} paddingVertical={1} paddingHorizontal={6} borderRadius={4} backgroundColor={T.accentSubtle}>
              <Icon name="spark" size={9} color={T.accent} />
              <Text fontSize={10} font="mono" color={T.accent} textTransform="uppercase" letterSpacing={0.5}>
                {t("dashboard:topChrome.account.roleBadge")}
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Status selector */}
      <Box paddingVertical={10} paddingHorizontal={8} borderBottomWidth={1} borderBottomColor={T.borderSubtle} borderStyle="solid">
        <Text tag="div" paddingTop={0} paddingHorizontal={6} paddingBottom={6} fontSize={10} font="mono" color={T.textTertiary} textTransform="uppercase" letterSpacing={0.5} display="block">
          {t("dashboard:topChrome.account.statusSection")}
        </Text>
        <Box grid gridTemplateColumns="1fr 1fr" gap={2}>
          {STATUS_OPTIONS.map((s) => (
            <StatusOptionButton key={s.id} s={s} active={status === s.id} onClick={() => setStatus(s.id)}/>
          ))}
        </Box>
      </Box>

      {/* Workspace */}
      <Box padding={10} borderBottomWidth={1} borderBottomColor={T.borderSubtle} borderStyle="solid">
        <Text tag="div" paddingTop={0} paddingHorizontal={4} paddingBottom={6} fontSize={10} font="mono" color={T.textTertiary} textTransform="uppercase" letterSpacing={0.5} display="block">
          {t("dashboard:topChrome.account.workspaceSection")}
        </Text>
        <Box display="flex" alignItems="center" gap={8} padding={8} borderRadius={6} borderWidth={1} borderColor={T.border} backgroundColor={T.bg} borderStyle="solid">
          <Text tag="div" width={22} height={22} borderRadius={5} backgroundColor="var(--kairo-color-text)" color="white" display="flex" alignItems="center" justifyContent="center" fontSize={10} fontWeight={600} flexShrink={0}>K</Text>
          <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
            <Text tag="div" fontSize={12} fontWeight={500} color={T.textPrimary} display="block">{t("dashboard:topChrome.account.workspaceName")}</Text>
            <Text tag="div" fontSize={10} color={T.textTertiary} font="mono" display="block">{t("dashboard:topChrome.account.workspacePlan")}</Text>
          </Box>
          <Pressable fontSize={10} font="mono" color={T.textTertiary} paddingVertical={2} paddingHorizontal={6} borderWidth={1} borderColor={T.border} borderRadius={4} backgroundColor="transparent" cursor="pointer" borderStyle="solid">
            {t("dashboard:topChrome.account.workspaceChange")}
          </Pressable>
        </Box>
      </Box>

      {/* Menu items */}
      <Menu label={t("dashboard:topChrome.account.title", "Account")}>
        {MENU_ITEMS.map((item) => (
          <MenuItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            shortcut={item.kbd ? <Kbd>{item.kbd}</Kbd> : undefined}
            onSelect={item.action}
          />
        ))}
      </Menu>

      {/* Theme toggle */}
      <Box paddingTop={6} paddingHorizontal={10} paddingBottom={10} borderTopWidth={1} borderTopColor={T.borderSubtle} borderStyle="solid">
        <Text tag="div" paddingTop={4} paddingHorizontal={0} paddingBottom={6} fontSize={10} font="mono" color={T.textTertiary} textTransform="uppercase" letterSpacing={0.5} display="block">
          {t("dashboard:topChrome.account.appearanceSection")}
        </Text>
        <Box display="flex" gap={2} padding={2} backgroundColor={T.surface} borderRadius={6} borderWidth={1} borderColor={T.border} borderStyle="solid">
          {THEME_OPTIONS.map(([id, label]) => (
            <Pressable key={id} onClick={() => setTheme(id)} flexGrow={1} flexShrink={1} flexBasis="0%" paddingVertical={5} paddingHorizontal={0} fontSize={11} borderRadius={4} backgroundColor={theme === id ? T.bg : "transparent"} color={theme === id ? T.textPrimary : T.textTertiary} font="mono" fontWeight={theme === id ? 500 : 400} boxShadow={theme === id ? "0 1px 3px rgba(9,9,11,.08)" : "none"} borderWidth={0} cursor="pointer">
              {label}
            </Pressable>
          ))}
        </Box>
      </Box>

      {/* Sign out */}
      <Menu label={t("dashboard:topChrome.account.signOut")} borderTopWidth={1} borderStyle="solid" borderTopColor={T.borderSubtle}>
        <MenuItem
          destructive
          icon={<Icon name="logout" size={14} color="var(--kairo-color-bad-ink)" />}
          label={t("dashboard:topChrome.account.signOut")}
          shortcut={<Text font="mono" fontSize={10} color="var(--kairo-color-bad-ink)" opacity={0.6}>{initials}</Text>}
          onSelect={onSignOut}
        />
      </Menu>
    </Box>
  );
}

// Small helpers to isolate hover state ───────────────────────────────────────

function StatusOptionButton({
  s, active, onClick,
}: { s: { id: UserStatus; label: string; dot: string }; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <Pressable onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} display="flex" alignItems="center" gap={8} paddingVertical={6} paddingHorizontal={8} borderRadius={5} backgroundColor={active || hov ? T.surface2 : "transparent"} fontSize={12} color={T.textSecondary} textAlign="left" borderWidth={0} cursor="pointer">
      <Text width={7} height={7} borderRadius={999} backgroundColor={s.dot} flexShrink={0} />
      <Text flexGrow={1} flexShrink={1} flexBasis="0%">{s.label}</Text>
      {active && <Icon name="check" size={11} color={T.textPrimary} />}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeaderActions — orchestrates both popovers
// ─────────────────────────────────────────────────────────────────────────────
interface HeaderActionsProps {
  initials: string;
  displayName: string;
  email: string;
  onViewChange: (view: AppView) => void;
  onSignOut: () => void;
}

function HeaderActions({ initials, displayName, email, onViewChange, onSignOut }: HeaderActionsProps) {
  const [open, setOpen] = useState<"notif" | "profile" | null>(null);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [status, setStatus] = useState<UserStatus>("online");
  const [theme, setTheme] = useState<Theme>("light");

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
  const curStatusDot = STATUS_DOTS[status];

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
  async function handleNotifSelect(item: NotifItem) {
    setOpen(null);
    markRead(item.id);
    if (!item.ticketId) return;

    const { selectTicket, requestScrollToMessage, upsertTicket, tickets } =
      useTriageStore.getState();

    if (!tickets.some((t) => t.id === item.ticketId)) {
      const ticket = await fetchTicketById(item.ticketId);
      if (ticket) upsertTicket(ticket);
    }

    onViewChange("triage");
    selectTicket(item.ticketId);
    if (item.ticketEventId) requestScrollToMessage(item.ticketEventId);
  }

  return (
    <Box display="flex" alignItems="center" gap={6}>
      {/* Bell */}
      <Popover open={open === "notif"} onOpenChange={(next) => setOpen(next ? "notif" : null)}>
        <PopoverTrigger>
        <Pressable aria-label="Notificaciones" padding={6} borderRadius={6} borderWidth={0} cursor="pointer" position="relative" color={open === "notif" ? T.textPrimary : T.textSecondary} backgroundColor={open === "notif" ? T.surface2 : "transparent"} display="flex" alignItems="center">
          <Icon name="bell" size={18} />
          {unread > 0 && (
            <Text boxSizing="content-box" position="absolute" top={2} right={2} minWidth={14} height={14} paddingVertical={0} paddingHorizontal={3} borderRadius={999} backgroundColor="var(--kairo-color-bad)" color="white" fontSize={9} font="mono" fontWeight={600} display="flex" alignItems="center" justifyContent="center" borderWidth={2} borderColor={T.bg} borderStyle="solid">
              {unread}
            </Text>
          )}
          {/* KAI-232 spec D5 — "there are mentions among them". The red count
              still covers ALL unread notifications; this is not a second
              counter, just a hint about what kind they are. */}
          {unreadMentions > 0 && (
            <Text position="absolute" bottom={3} right={3} width={7} height={7} borderRadius={999} backgroundColor="var(--k-mention-solid)" borderWidth={1.5} borderColor={T.bg} borderStyle="solid" />
          )}
        </Pressable>
        </PopoverTrigger>
        <PopoverContent label="Notificaciones" align="end">
          <NotificationsPopover
            items={notifs}
            onMarkAll={markAllRead}
            onSelect={handleNotifSelect}
          />
        </PopoverContent>
      </Popover>

      {/* Avatar + chevron */}
      <Box paddingLeft={8} marginLeft={2} borderLeftWidth={1} borderLeftColor={T.border} borderStyle="solid">
      <Popover open={open === "profile"} onOpenChange={(next) => setOpen(next ? "profile" : null)}>
        <PopoverTrigger>
        <Pressable aria-label="Cuenta" display="flex" alignItems="center" gap={6} padding={2} borderRadius={999} backgroundColor={open === "profile" ? T.surface2 : "transparent"} borderWidth={1} borderStyle="solid" borderColor={open === "profile" ? T.border : "transparent"} cursor="pointer">
          <Box position="relative">
            <Text tag="div" width={28} height={28} borderRadius={999} backgroundImage="linear-gradient(135deg, var(--k-accent) 0%, var(--kairo-color-accent-indigo) 100%)" color="white" fontSize={11} fontWeight={600} display="flex" alignItems="center" justifyContent="center">
              {initials}
            </Text>
            <Box position="absolute" bottom={-1} right={-1} width={9} height={9} borderRadius={999} backgroundColor={curStatusDot} borderWidth={2} borderColor={T.bg} borderStyle="solid" />
          </Box>
          <Icon name="down" size={12} color={T.textTertiary} />
        </Pressable>
        </PopoverTrigger>
        <PopoverContent label="Cuenta" align="end">
          <ProfilePopover
            initials={initials}
            displayName={displayName}
            email={email}
            status={status}
            setStatus={setStatus}
            theme={theme}
            setTheme={setTheme}
            onNavigate={(view) => { setOpen(null); onViewChange(view); }}
            onSignOut={() => { setOpen(null); onSignOut(); }}
          />
        </PopoverContent>
      </Popover>
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TopChrome — public export
// ─────────────────────────────────────────────────────────────────────────────
interface TopChromeProps {
  collapsed: boolean;
  onToggle: () => void;
  onViewChange: (view: AppView) => void;
}

export function TopChrome({ collapsed, onToggle, onViewChange }: TopChromeProps) {
  const { t } = useTranslation(["dashboard"]);
  const { profile, signOut } = useAuth();

  const initials = getInitials(profile?.name, profile?.email);

  const displayName = profile?.name ?? profile?.email ?? "Usuario";
  const email = profile?.email ?? "";

  return (
    <Box tag="header" height={56} flexShrink={0} display="flex" alignItems="center" paddingVertical={0} paddingHorizontal={16} gap={16} backgroundColor={T.bg} borderBottomWidth={1} borderBottomColor={T.border} borderStyle="solid">
      {/* Logo + sidebar toggle */}
      <Box width={collapsed ? 40 : 208} display="flex" alignItems="center" justifyContent={collapsed ? "center" : "space-between"} flexShrink={0} transition="width 0.18s ease">
        <Box display="flex" alignItems="center" gap={8}>
          <Box width={28} height={28} borderRadius={6} backgroundColor="var(--kairo-color-accent)" display="inline-flex" alignItems="center" justifyContent="center" flexShrink={0}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
            </svg>
          </Box>
          {!collapsed && (
            <Text fontSize={15} fontWeight={600} color={T.textPrimary} font="display" letterSpacing={-0.15}>
              Kairo
            </Text>
          )}
        </Box>
        <Pressable onClick={onToggle} aria-label="Toggle sidebar" padding={6} color={T.textTertiary} backgroundColor="transparent" borderWidth={0} cursor="pointer" borderRadius={6} display="flex" alignItems="center">
          <Icon name="sidebar" size={16} />
        </Pressable>
      </Box>

      {/* Search */}
      <Text tag="div" flexGrow={1} flexShrink={1} flexBasis="0%" maxWidth={480} height={34} borderWidth={1} borderColor={T.border} borderRadius={8} display="flex" alignItems="center" paddingVertical={0} paddingHorizontal={10} gap={8} backgroundColor={T.surface} color={T.textTertiary} fontSize={13} borderStyle="solid">
        <Icon name="search" size={14} />
        <Text flexGrow={1} flexShrink={1} flexBasis="0%">{t("dashboard:topChrome.searchPlaceholder")}</Text>
        <KbdGroup keys={["⌘", "K"]} />
      </Text>

      {/* Right actions */}
      <Box marginLeft="auto">
        <HeaderActions
          initials={initials}
          displayName={displayName}
          email={email}
          onViewChange={onViewChange}
          onSignOut={signOut}
        />
      </Box>
    </Box>
  );
}
