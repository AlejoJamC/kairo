// App status bar — the shortcuts that work in the current view and the open-ticket count.

import { useTranslation } from "react-i18next";
import type { SidebarCounts } from "@kairo/client-core/hooks/use-sidebar-counts";
import { VIEW_TO_STATUS } from "@/lib/sidebar-view-status";
import { StatusBar } from "@kairo/ui";

export function AppStatusBar({ counts }: { counts: SidebarCounts | null }) {
  const { t } = useTranslation(["dashboard"]);

  const openStatuses = VIEW_TO_STATUS.triage ?? [];
  const open = counts ? openStatuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0) : 0;

  return (
    <StatusBar
      shortcuts={[{ keys: "⌘K", label: t("dashboard:statusBar.commands") }]}
      status={t("dashboard:statusBar.open", { count: open })}
    />
  );
}
