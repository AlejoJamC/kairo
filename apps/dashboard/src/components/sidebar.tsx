// Sidebar — collapsible nav panel.
// Visual design: cockpit.jsx lines 139–187 (packages/claude_design).
// Toggle button moved to TopChrome; sidebar only receives collapsed state.

import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@kairo/client-core/auth";
import { useSidebarCounts } from "@kairo/client-core/hooks/use-sidebar-counts";
import { VIEW_TO_STATUS } from "@/lib/sidebar-view-status";
import { SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS } from "@/lib/poll-intervals";
import type { AppView } from "@/types";
import { Box, NavItem, Tooltip, type IconName } from "@kairo/ui";

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

type SidebarEntry = {
  icon: IconName;
  label: string;
  view: AppView;
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void; // kept for interface compat; toggle renders in TopChrome
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

export function Sidebar({ collapsed, activeView, onViewChange }: SidebarProps) {
  const { t } = useTranslation(["dashboard"]);
  const { isAdmin } = useAuth();
  const counts = useSidebarCounts(SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS);

  const mainNavItems: SidebarEntry[] = [
    { icon: "triage",         label: t("dashboard:sidebar.triage"),         view: "triage" },
    { icon: "awaiting",         label: t("dashboard:sidebar.pendingClient"),  view: "awaiting" },
    { icon: "resolved",   label: t("dashboard:sidebar.resolved"),       view: "resolved" },
    { icon: "escalated", label: t("dashboard:sidebar.escalation"),     view: "escalated" },
    { icon: "spark",      label: t("dashboard:sidebar.aiReview"),       view: "ai-review" },
    { icon: "knowledge",      label: t("dashboard:sidebar.knowledge"),      view: "knowledge" },
  ];

  const adminNavItems: SidebarEntry[] = [
    { icon: "clients",    label: t("dashboard:sidebar.clients"),  view: "clients" },
    { icon: "settings", label: t("dashboard:sidebar.settings"), view: "settings" },
  ];

  const getCount = (view: AppView): number => {
    const statuses = VIEW_TO_STATUS[view];
    if (!statuses || !counts) return 0;
    return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  };

  const renderItem = (item: SidebarEntry) => {
    const isActive = item.view === activeView;
    const count = getCount(item.view);

    const entry = (
      <NavItem
        icon={item.icon}
        label={item.label}
        active={isActive}
        collapsed={collapsed}
        count={count > 0 ? count : undefined}
        live={isActive && count > 0}
        onPress={() => onViewChange(item.view)}
      />
    );

    return (
      <Box key={item.view} marginBottom={1}>
        {collapsed ? <Tooltip label={item.label} side="right">{entry}</Tooltip> : entry}
      </Box>
    );
  };

  return (
    <>
      <Box tag="aside" width={collapsed ? 56 : 240} flexShrink={0} borderRightWidth={1} borderRightColor="var(--k-border)" backgroundColor="var(--k-surface)" display="flex" flexDirection="column" overflow="hidden" transition="width 0.18s ease" borderStyle="solid">
        {/* Nav items */}
        <Box tag="nav" padding={8} flexGrow={1} flexShrink={1} flexBasis="0%">
          {mainNavItems.map(renderItem)}

          {isAdmin && (
            <>
              <Box marginVertical={8} marginHorizontal={0} borderTopWidth={1} borderTopColor="var(--k-border)" borderStyle="solid" />
              {adminNavItems.map(renderItem)}
            </>
          )}
        </Box>

        {/* Sidebar bottom — language switcher + user menu */}
        <Box borderTopWidth={1} borderTopColor="var(--k-border)" paddingVertical={8} paddingHorizontal={collapsed ? 8 : 12} borderStyle="solid">
          {!collapsed && (
            <Box marginBottom={4}>
              <LanguageSwitcher />
            </Box>
          )}
          <UserMenu collapsed={collapsed} />
        </Box>
      </Box>
    </>
  );
}
