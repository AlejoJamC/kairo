// Sidebar — workspace header (logo, notifications, collapse), search, navigation,
// language and the account menu. Collapses to icons only.

import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import type { SidebarCounts } from "@kairo/client-core/hooks/use-sidebar-counts";
import { AccountMenu } from "@/components/account-menu";
import { GlobalSearch } from "@/components/global-search";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationsBell } from "@/components/notifications-bell";
import { VIEW_TO_STATUS } from "@/lib/sidebar-view-status";
import type { AppView } from "@/types";
import { Box, Icon, IconButton, NavItem, Text, Tooltip, type IconName } from "@kairo/ui";

type SidebarEntry = {
  icon: IconName;
  label: string;
  view: AppView;
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  counts: SidebarCounts | null;
}

export function Sidebar({ collapsed, onToggle, activeView, onViewChange, counts }: SidebarProps) {
  const { t } = useTranslation(["dashboard"]);
  const { isAdmin } = useAuth();

  const mainNavItems: SidebarEntry[] = [
    { icon: "triage",    label: t("dashboard:sidebar.triage"),        view: "triage" },
    { icon: "awaiting",  label: t("dashboard:sidebar.pendingClient"), view: "awaiting" },
    { icon: "resolved",  label: t("dashboard:sidebar.resolved"),      view: "resolved" },
    { icon: "escalated", label: t("dashboard:sidebar.escalation"),    view: "escalated" },
    { icon: "spark",     label: t("dashboard:sidebar.aiReview"),      view: "ai-review" },
    { icon: "knowledge", label: t("dashboard:sidebar.knowledge"),     view: "knowledge" },
  ];

  const adminNavItems: SidebarEntry[] = [
    { icon: "clients",  label: t("dashboard:sidebar.clients"),  view: "clients" },
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
      <Box key={item.view}>
        {collapsed ? <Tooltip label={item.label} side="right">{entry}</Tooltip> : entry}
      </Box>
    );
  };

  return (
    <Box
      tag="nav"
      aria-label={t("dashboard:sidebar.workspace")}
      width={collapsed ? 60 : 232}
      flexShrink={0}
      display="flex"
      flexDirection="column"
      gap={14}
      paddingVertical={12}
      paddingHorizontal={10}
      backgroundColor="var(--kairo-surface-sidebar)"
      borderRightWidth={1}
      borderRightColor="var(--k-border)"
      borderStyle="solid"
      transition="width 0.16s ease"
    >
      <Box display="flex" alignItems="center" flexWrap="wrap" gap={6} paddingLeft={4} paddingRight={2} justifyContent={collapsed ? "center" : "flex-start"}>
        <Box width={24} height={24} borderRadius={6} backgroundColor="var(--kairo-color-accent)" display="inline-flex" alignItems="center" justifyContent="center" flexShrink={0}>
          <Icon name="zap" size={13} color="var(--kairo-color-on-accent)" strokeWidth={2.4} />
        </Box>
        {!collapsed && (
          <Text fontSize={14} fontWeight={600} letterSpacing={-0.14} color="var(--k-text-primary)" marginLeft={4} flexGrow={1}>
            Kairo
          </Text>
        )}
        <NotificationsBell onViewChange={onViewChange} />
        <IconButton label={t("dashboard:topChrome.palette.toggleSidebar")} onPress={onToggle}>
          <Icon name="sidebar" size={16} color="var(--kairo-color-faint)" />
        </IconButton>
      </Box>

      <GlobalSearch collapsed={collapsed} onViewChange={onViewChange} />

      <Box display="flex" flexDirection="column" gap={2}>
        {mainNavItems.map(renderItem)}
      </Box>

      {isAdmin && (
        <>
          <Box height={1} marginHorizontal={6} backgroundColor="var(--k-border)" />
          <Box display="flex" flexDirection="column" gap={2}>
            {adminNavItems.map(renderItem)}
          </Box>
        </>
      )}

      <Box flexGrow={1} />

      <Box display="flex" flexDirection="column" gap={6}>
        <LanguageSwitcher collapsed={collapsed} />
        <AccountMenu collapsed={collapsed} onViewChange={onViewChange} />
      </Box>
    </Box>
  );
}
