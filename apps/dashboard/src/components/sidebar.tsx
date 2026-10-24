// Sidebar — wires the library sidebar to the session: navigation counts, the
// bell, the account menu, the language, the command palette (⌘K) and the
// shortcuts dialog (?).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import type { SidebarCounts } from "@kairo/client-core/hooks/use-sidebar-counts";
import { AccountMenu } from "@/components/account-menu";
import { CommandPaletteHost } from "@/components/command-palette-host";
import { NotificationsBell } from "@/components/notifications-bell";
import { ShortcutsHost } from "@/components/shortcuts-host";
import { useAppCommands } from "@/lib/app-commands";
import { useLocale } from "@/hooks/useLocale";
import { VIEW_TO_STATUS } from "@/lib/sidebar-view-status";
import type { SupportedLanguage } from "@/i18n/types";
import type { AppView } from "@/types";
import { Sidebar as SidebarPiece, type IconName, type SidebarEntry } from "@kairo/ui";

type NavDefinition = { icon: IconName; label: string; view: AppView };

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  counts: SidebarCounts | null;
}

export function Sidebar({ collapsed, onToggle, activeView, onViewChange, counts }: SidebarProps) {
  const { t } = useTranslation(["dashboard", "common"]);
  const { isAdmin } = useAuth();
  const { language, setLanguage, supportedLanguages, languageMeta } = useLocale();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // The native menu asks for the palette and the shortcuts dialog through the app commands.
  useEffect(() => {
    const unsubscribe = useAppCommands.subscribe((state, previous) => {
      if (state.paletteRequests !== previous.paletteRequests) setPaletteOpen(true);
      if (state.shortcutsRequests !== previous.shortcutsRequests) setShortcutsOpen(true);
    });
    return unsubscribe;
  }, []);

  // ⌘K / Ctrl+K opens the palette from anywhere. It only opens: in the desktop app the
  // native menu item answers the same key, and a toggle would close what the menu opened.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const getCount = (view: AppView): number | undefined => {
    const statuses = VIEW_TO_STATUS[view];
    if (!statuses || !counts) return undefined;
    const total = statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
    return total > 0 ? total : undefined;
  };

  const mainNav: NavDefinition[] = [
    { icon: "triage", label: t("dashboard:sidebar.triage"), view: "triage" },
    { icon: "awaiting", label: t("dashboard:sidebar.pendingClient"), view: "awaiting" },
    { icon: "resolved", label: t("dashboard:sidebar.resolved"), view: "resolved" },
    { icon: "escalated", label: t("dashboard:sidebar.escalation"), view: "escalated" },
    { icon: "spark", label: t("dashboard:sidebar.aiReview"), view: "ai-review" },
    { icon: "knowledge", label: t("dashboard:sidebar.knowledge"), view: "knowledge" },
  ];
  const adminNav: NavDefinition[] = [
    { icon: "clients", label: t("dashboard:sidebar.clients"), view: "clients" },
    { icon: "settings", label: t("dashboard:sidebar.settings"), view: "settings" },
  ];

  const entry = ({ icon, label, view }: NavDefinition): SidebarEntry => {
    const count = getCount(view);
    return {
      id: view,
      icon,
      label,
      active: view === activeView,
      count,
      countLabel: count !== undefined ? t("dashboard:sidebar.ticketsCount", { count }) : undefined,
      live: view === activeView && count !== undefined,
      onSelect: () => onViewChange(view),
    };
  };

  return (
    <>
      <SidebarPiece
        collapsed={collapsed}
        onToggleCollapsed={onToggle}
        bell={<NotificationsBell onViewChange={onViewChange} />}
        search={{ label: t("dashboard:topChrome.searchPlaceholder"), shortcut: "⌘K", onOpen: () => setPaletteOpen(true) }}
        groups={[mainNav.map(entry), ...(isAdmin ? [adminNav.map(entry)] : [])]}
        language={{
          value: language,
          options: supportedLanguages.map((lang: SupportedLanguage) => ({ value: lang, label: languageMeta[lang].nativeLabel })),
          onChange: (value) => setLanguage(value as SupportedLanguage),
        }}
        account={<AccountMenu collapsed={collapsed} onViewChange={onViewChange} onOpenShortcuts={() => setShortcutsOpen(true)} />}
        labels={{
          nav: t("dashboard:sidebar.workspace"),
          collapse: t("dashboard:sidebar.collapse"),
          expand: t("dashboard:sidebar.expand"),
          language: t("common:language"),
        }}
      />
      <CommandPaletteHost open={paletteOpen} onClose={() => setPaletteOpen(false)} onViewChange={onViewChange} />
      <ShortcutsHost open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
