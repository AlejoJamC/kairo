// What the desktop app adds around the dashboard: the native menu bar, the
// counter on the app icon and the system notifications. It draws nothing in the
// window; the OS draws all three from what the app already knows.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { getPlatform } from "@kairo/client-core/config";
import { AWAITING_STATUSES, isTicketReadOnly } from "@kairo/client-core/triage-status";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { computeTicketOperationalSla } from "@kairo/types";
import {
  buildAppMenu,
  buildSystemNotification,
  shouldSendSystemNotification,
  syncDockBadge,
  type AppMenuState,
  type AppView as MenuView,
  type SystemNotificationEvent,
} from "@kairo/ui";
import { useCommands } from "@/hooks/use-commands";
import { useLocale } from "@/hooks/useLocale";
import { useAppCommands } from "@/lib/app-commands";
import { disableUnhandled, localizeMenu } from "@/lib/desktop-menu";
import { APP_WINDOW_MIN_HEIGHT, appWindowMinWidth } from "@/lib/desktop-window";
import { subscribeNotifications } from "@/lib/notification-feed";
import { slaDisplay } from "@/lib/sla-display";
import type { SupportedLanguage } from "@/i18n/types";
import type { AppView } from "@/types";

const SLA_CHECK_INTERVAL_MS = 30_000;

/** The views the menu knows; the settings sub-pages read as Settings and in-progress as Triage. */
function menuView(view: AppView): MenuView {
  if (view === "change-password" || view === "channels") return "settings";
  if (view === "in-progress") return "triage";
  return view as MenuView;
}

interface DesktopIntegrationProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  sidebarCollapsed: boolean;
}

export function DesktopIntegration({ view, onViewChange, sidebarCollapsed }: DesktopIntegrationProps) {
  const host = getPlatform().host;
  const { t, i18n } = useTranslation(["dashboard"]);
  const { signOut } = useAuth();
  const { language, setLanguage } = useLocale();
  const tickets = useTriageStore((state) => state.tickets);
  const selectedId = useTriageStore((state) => state.selectedTicketId);
  const slaConfig = useTriageStore((state) => state.operationalSlaConfig);
  const presence = useAppCommands((state) => state.presence);
  const ticketListHidden = useAppCommands((state) => state.ticketListHidden);
  const contextTab = useAppCommands((state) => state.contextTab);
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const selectedShortId = selected?.ticket_number ? `KAI-${selected.ticket_number}` : null;

  // The window never gets narrower than the columns need; collapsing the sidebar lowers the floor.
  useEffect(() => {
    host?.setMinWindowSize(appWindowMinWidth(sidebarCollapsed, ticketListHidden), APP_WINDOW_MIN_HEIGHT);
  }, [host, sidebarCollapsed, ticketListHidden]);

  // ── Native menu ───────────────────────────────────────────────────────────
  const { run } = useCommands(view, onViewChange);
  const handlers: Record<string, () => void> = {
    settings: () => onViewChange("settings"),
    "sign-out": () => void signOut(),
    sidebar: () => run("toggle-sidebar"),
    "language-es": () => setLanguage("es" as SupportedLanguage),
    "language-en": () => setLanguage("en" as SupportedLanguage),
    search: () => useAppCommands.getState().requestPalette("all"),
    "all-commands": () => useAppCommands.getState().requestPalette("commands"),
    "ticket-list": () => run("toggle-ticket-list"),
    "context-client": () => useTriageStore.getState().requestPanelTab("client"),
    "context-assistant": () => useTriageStore.getState().requestPanelTab("assistant"),
    "context-notes": () => useTriageStore.getState().requestPanelTab("notes"),
    "context-escalate": () => useTriageStore.getState().requestPanelTab("escalate"),
    send: () => useTriageStore.getState().requestComposerSend("send"),
    "send-resolve": () => useTriageStore.getState().requestComposerSend("send-resolve"),
    "wrong-classification": () => useTriageStore.getState().requestTicketMenu("reclassify"),
    "group-with": () => useTriageStore.getState().requestTicketMenu("group"),
    "ask-assistant": () => run("ask-assistant"),
    "go-triage": () => onViewChange("triage"),
    "go-awaiting": () => onViewChange("awaiting"),
    "go-resolved": () => onViewChange("resolved"),
    "go-escalated": () => onViewChange("escalated"),
    "go-ai-review": () => onViewChange("ai-review"),
    "go-knowledge": () => onViewChange("knowledge"),
    "go-clients": () => onViewChange("clients"),
    "go-settings": () => onViewChange("settings"),
    "next-ticket": () => useTriageStore.getState().selectRelativeTicket(1),
    "previous-ticket": () => useTriageStore.getState().selectRelativeTicket(-1),
    acknowledge: () => useTriageStore.getState().requestTicketAction("acknowledge"),
    resolve: () => useTriageStore.getState().requestTicketAction("resolve"),
    escalate: () => useTriageStore.getState().requestPanelTab("escalate"),
    "internal-note": () => useTriageStore.getState().requestComposeNote(),
  };
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const menuState: AppMenuState = {
    view: menuView(view),
    language: language === "es" ? "es" : "en",
    sidebarExpanded: !sidebarCollapsed,
    ticketListShown: !ticketListHidden,
    contextTab: selected ? (contextTab as AppMenuState["contextTab"]) : null,
    ticketOpen: selected !== null,
    ticketAwaitingCustomer: selected !== null && (AWAITING_STATUSES as string[]).includes(selected.status ?? ""),
    ticketFinal: selected !== null && isTicketReadOnly(selected.status ?? ""),
    ticketPriority: (["P1", "P2", "P3"] as const).find((level) => level === selected?.priority) ?? "P3",
    ticketStatus: selected?.status ?? "",
    statusOptions: [],
    composerEmpty: true,
    similarTicketId: null,
  };
  const menuJson = useMemo(() => {
    const labels = (i18n.getResourceBundle(i18n.language, "dashboard")?.desktop?.menu ?? {}) as Record<string, string>;
    const labelled = localizeMenu(buildAppMenu(menuState), (id) => labels[id]);
    return JSON.stringify(disableUnhandled(labelled, new Set(Object.keys(handlers))));
    // The menu is a function of the app state it mirrors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, language, sidebarCollapsed, ticketListHidden, contextTab, selected?.id, selected?.status, selected?.priority, t, i18n]);

  useEffect(() => {
    host?.setMenu(menuJson);
  }, [host, menuJson]);

  useEffect(() => {
    if (!host) return;
    return host.onMenuAction((id) => handlersRef.current[id]?.());
  }, [host]);

  // ── Counter on the app icon and system notifications ──────────────────────
  const [unread, setUnread] = useState<number | null>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const sentKeys = useRef<Set<string>>(new Set());
  const windowActive = useRef(true);
  const rules = useRef({ presence, openTicketId: selectedShortId });
  useEffect(() => {
    rules.current = { presence, openTicketId: selectedShortId };
  });

  useEffect(() => {
    const unsubscribe = getPlatform().appFocus.subscribe((visible) => {
      windowActive.current = visible;
    });
    return unsubscribe;
  }, []);

  function notify(event: SystemNotificationEvent, title: string, body: string) {
    const rulesNow = { presence: rules.current.presence, doNotDisturb: false, windowActive: windowActive.current, openTicketId: rules.current.openTicketId, notificationsDisabled: false };
    if (!shouldSendSystemNotification(event, rulesNow)) return;
    const { dedupKey } = buildSystemNotification(event);
    if (sentKeys.current.has(dedupKey)) return;
    sentKeys.current.add(dedupKey);
    host?.notify(title, body);
  }
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });

  useEffect(() => {
    return subscribeNotifications((rows) => {
      setUnread(rows.filter((row) => !row.read_at).length);
      // The first poll only records what is already there; later polls notify what is new.
      if (seenIds.current === null) {
        seenIds.current = new Set(rows.map((row) => row.id));
        return;
      }
      for (const row of rows) {
        if (seenIds.current.has(row.id)) continue;
        seenIds.current.add(row.id);
        if (row.read_at || row.kind !== "mention") continue;
        const ticket = row.ticket_short_id ?? "";
        notifyRef.current(
          { kind: "mention", from: row.title, ticketId: ticket, excerpt: row.body },
          t("dashboard:desktop.notify.mention", { from: row.title, ticket }),
          row.body,
        );
      }
    });
  }, [t]);

  useEffect(() => {
    if (unread === null) return;
    syncDockBadge(host, unread);
  }, [host, unread]);

  // SLA state changes of the tickets in the queue: at risk, escalating, overdue.
  const slaStatus = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    function check() {
      const next = new Map<string, string>();
      const previous = slaStatus.current;
      for (const ticket of useTriageStore.getState().tickets) {
        const timing = computeTicketOperationalSla(ticket, slaConfig);
        if (!timing) continue;
        const { status, seconds } = slaDisplay(timing);
        next.set(ticket.id, status);
        if (!previous || previous.get(ticket.id) === status || status === "onTime") continue;
        const id = ticket.ticket_number ? `KAI-${ticket.ticket_number}` : ticket.id;
        const subject = ticket.subject ?? "—";
        const client = ticket.from_name ?? ticket.from_email ?? "—";
        const minutes = Math.max(0, Math.floor(seconds / 60));
        const body = `${subject} · ${client}`;
        if (status === "atRisk") notifyRef.current({ kind: "sla-at-risk", ticketId: id, minutesLeft: minutes, subject, client }, t("dashboard:desktop.notify.slaAtRisk", { ticket: id, minutes }), body);
        else if (status === "escalating") notifyRef.current({ kind: "sla-escalating", ticketId: id, minutesLeft: minutes, subject, client }, t("dashboard:desktop.notify.slaEscalating", { ticket: id, minutes }), body);
        else notifyRef.current({ kind: "sla-overdue", ticketId: id, subject, client }, t("dashboard:desktop.notify.slaOverdue", { ticket: id }), body);
      }
      slaStatus.current = next;
    }
    check();
    const timer = setInterval(check, SLA_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slaConfig, t]);

  return null;
}
