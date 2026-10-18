// Sidebar — collapsible nav panel.
// Visual design: cockpit.jsx lines 139–187 (packages/claude_design).
// Toggle button moved to TopChrome; sidebar only receives collapsed state.

import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@kairo/client-core/auth";
import { useSidebarCounts } from "@kairo/client-core/hooks/use-sidebar-counts";
import { VIEW_TO_STATUS } from "@/lib/sidebar-view-status";
import { SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS } from "@/lib/poll-intervals";
import type { AppView } from "@/types";
import { Box, Icon, Pressable, PulseDot, Text, Tooltip, type IconName } from "@kairo/ui";

// ---------------------------------------------------------------------------
// NavBadge — count pill / collapsed dot
// ---------------------------------------------------------------------------

function NavBadge({
  count,
  collapsed,
  isActive = false,
}: {
  count: number;
  collapsed: boolean;
  isActive?: boolean;
}) {
  const prevRef = useRef(count);
  const [flashPulse, setFlashPulse] = useState(false);

  useEffect(() => {
    if (prevRef.current !== count && count > 0) {
      setFlashPulse(true);
      const t = setTimeout(() => setFlashPulse(false), 600);
      prevRef.current = count;
      return () => clearTimeout(t);
    }
    prevRef.current = count;
  }, [count]);

  if (count === 0) return null;

  if (collapsed) {
    const collapsedLabel = count > 9 ? "9+" : String(count);
    return (
      <Text position="absolute" top={-4} right={-4} display="flex" height={16} minWidth={16} alignItems="center" justifyContent="center" borderRadius={999} paddingHorizontal={2} fontSize={9} fontWeight={700} color="white" lineHeightRatio={1} backgroundColor="var(--k-accent)" pulse={flashPulse}>
        {collapsedLabel}
      </Text>
    );
  }

  const label = count > 99 ? "99+" : String(count);

  return (
    <Text marginLeft="auto" display="flex" alignItems="center" gap={4} font="mono" fontSize={11} color="var(--k-text-tertiary)">
      {isActive && (
        <PulseDot width={5} height={5} backgroundColor="var(--k-accent)" />
      )}
      {label}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

type NavItem = {
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

  const mainNavItems: NavItem[] = [
    { icon: "triage",         label: t("dashboard:sidebar.triage"),         view: "triage" },
    { icon: "awaiting",         label: t("dashboard:sidebar.pendingClient"),  view: "awaiting" },
    { icon: "resolved",   label: t("dashboard:sidebar.resolved"),       view: "resolved" },
    { icon: "escalated", label: t("dashboard:sidebar.escalation"),     view: "escalated" },
    { icon: "spark",      label: t("dashboard:sidebar.aiReview"),       view: "ai-review" },
    { icon: "knowledge",      label: t("dashboard:sidebar.knowledge"),      view: "knowledge" },
  ];

  const adminNavItems: NavItem[] = [
    { icon: "clients",    label: t("dashboard:sidebar.clients"),  view: "clients" },
    { icon: "settings", label: t("dashboard:sidebar.settings"), view: "settings" },
  ];

  const getCount = (view: AppView): number => {
    const statuses = VIEW_TO_STATUS[view];
    if (!statuses || !counts) return 0;
    return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  };

  const renderItem = (item: NavItem) => {
    const isActive = item.view === activeView;
    const count = getCount(item.view);

    const btn = (
      <Pressable onClick={() => onViewChange(item.view)} onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--k-surface-2)";
        }} onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }} display="flex" width="100%" alignItems="center" gap={10} paddingTop={collapsed ? 8 : 7} paddingRight={collapsed ? 8 : 10} paddingBottom={collapsed ? 8 : 7} paddingLeft={collapsed ? 8 : 10} borderRadius={6} cursor="pointer" marginBottom={1} backgroundColor={isActive ? "var(--k-bg)" : "transparent"} borderWidth={1} borderColor={isActive ? "var(--k-border)" : "transparent"} color={isActive ? "var(--k-text-primary)" : "var(--k-text-secondary)"} fontSize={13} fontWeight={isActive ? 500 : 400} justifyContent={collapsed ? "center" : "flex-start"} transition="background 0.12s ease, color 0.12s ease" borderStyle="solid">
        <Box tag="span" position="relative" flexShrink={0}>
          <Icon name={item.icon} size={16} />
          {collapsed && <NavBadge count={count} collapsed isActive={isActive} />}
        </Box>
        {!collapsed && (
          <>
            <Text flexGrow={1} flexShrink={1} flexBasis="0%" textAlign="left">{item.label}</Text>
            <NavBadge count={count} collapsed={false} isActive={isActive} />
          </>
        )}
      </Pressable>
    );

    if (!collapsed) return <div key={item.view}>{btn}</div>;

    return (
      <Tooltip key={item.view} label={item.label} side="right">
        {btn}
      </Tooltip>
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
