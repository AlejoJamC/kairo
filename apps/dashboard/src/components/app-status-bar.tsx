// App status bar — the shortcuts of the current view and the open-ticket count.
// Queue views offer the ticket shortcuts; page views only commands and shortcuts.

import { useTranslation } from "react-i18next";
import type { SidebarCounts } from "@kairo/client-core/hooks/use-sidebar-counts";
import { VIEW_TO_STATUS } from "@/lib/sidebar-view-status";
import type { AppView } from "@/types";
import { StatusBar, type StatusBarShortcut } from "@kairo/ui";

const QUEUE_VIEWS: AppView[] = ["triage", "awaiting", "resolved", "escalated", "ai-review"];

export function AppStatusBar({ counts, view }: { counts: SidebarCounts | null; view: AppView }) {
  const { t } = useTranslation(["dashboard"]);

  const openStatuses = VIEW_TO_STATUS.triage ?? [];
  const open = counts ? openStatuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0) : 0;

  const viewShortcuts: StatusBarShortcut[] = QUEUE_VIEWS.includes(view)
    ? [
        { keys: "J K", label: t("dashboard:statusBar.navigate") },
        { keys: "A", label: t("dashboard:statusBar.acknowledge") },
        { keys: "R", label: t("dashboard:statusBar.resolve") },
        { keys: "E", label: t("dashboard:statusBar.escalate") },
        { keys: "N", label: t("dashboard:statusBar.note") },
      ]
    : [];

  return (
    <StatusBar
      shortcuts={viewShortcuts}
      pinned={[
        { keys: "⌘ K", label: t("dashboard:statusBar.commands") },
        { keys: "?", label: t("dashboard:statusBar.shortcuts") },
      ]}
      status={t("dashboard:statusBar.open", { count: open })}
    />
  );
}
