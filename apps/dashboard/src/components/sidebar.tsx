// Sidebar — collapsible nav panel.
// Visual design: cockpit.jsx lines 139–187 (packages/claude_design).
// Toggle button moved to TopChrome; sidebar only receives collapsed state.

import { useRef, useState, useEffect } from "react";
import {
  Inbox,
  Activity,
  Clock,
  CircleCheck,
  ArrowUpCircle,
  Users,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/contexts/auth-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarCounts, VIEW_TO_STATUS } from "@/hooks/useSidebarCounts";
import type { AppView } from "@/types";

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
      <span
        className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white leading-none ${
          flashPulse ? "animate-pulse" : ""
        }`}
        style={{ background: "var(--k-accent)" }}
      >
        {collapsedLabel}
      </span>
    );
  }

  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      className="ml-auto flex items-center gap-1 tabular-nums"
      style={{ fontFamily: "var(--k-font-mono)", fontSize: 11, color: "var(--k-text-tertiary)" }}
    >
      {isActive && (
        <span
          className="animate-pulse inline-block rounded-full shrink-0"
          style={{ width: 5, height: 5, background: "var(--k-accent)" }}
        />
      )}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

type NavItem = {
  icon: typeof Inbox;
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
  const counts = useSidebarCounts();

  const mainNavItems: NavItem[] = [
    { icon: Inbox,         label: t("dashboard:sidebar.inbox"),          view: "inbox" },
    { icon: Activity,      label: t("dashboard:sidebar.panel"),          view: "panel" },
    { icon: Clock,         label: t("dashboard:sidebar.pendingClient"),  view: "awaiting" },
    { icon: CircleCheck,   label: t("dashboard:sidebar.autoResolvable"), view: "auto-resolved" },
    { icon: ArrowUpCircle, label: t("dashboard:sidebar.escalation"),     view: "escalated" },
  ];

  const adminNavItems: NavItem[] = [
    { icon: Users,    label: t("dashboard:sidebar.clients"),  view: "clients" },
    { icon: Settings, label: t("dashboard:sidebar.settings"), view: "settings" },
  ];

  const getCount = (view: AppView): number => {
    const status = VIEW_TO_STATUS[view];
    if (!status || !counts) return 0;
    return counts[status] ?? 0;
  };

  const renderItem = (item: NavItem) => {
    const isActive = item.view === activeView;
    const count = getCount(item.view);

    const btn = (
      <button
        onClick={() => onViewChange(item.view)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 10,
          padding: collapsed ? "8px" : "7px 10px",
          borderRadius: 6,
          cursor: "pointer",
          marginBottom: 1,
          background: isActive ? "var(--k-bg)" : "transparent",
          border: isActive ? "1px solid var(--k-border)" : "1px solid transparent",
          color: isActive ? "var(--k-text-primary)" : "var(--k-text-secondary)",
          fontSize: 13,
          fontWeight: isActive ? 500 : 400,
          justifyContent: collapsed ? "center" : "flex-start",
          transition: "background 0.12s ease, color 0.12s ease",
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--k-surface-2)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        <span className="relative shrink-0">
          <item.icon style={{ width: 16, height: 16 }} />
          {collapsed && <NavBadge count={count} collapsed isActive={isActive} />}
        </span>
        {!collapsed && (
          <>
            <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
            <NavBadge count={count} collapsed={false} isActive={isActive} />
          </>
        )}
      </button>
    );

    if (!collapsed) return <div key={item.view}>{btn}</div>;

    return (
      <Tooltip key={item.view} delayDuration={200}>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider>
      <aside
        style={{
          width: collapsed ? 56 : 240,
          flexShrink: 0,
          borderRight: "1px solid var(--k-border)",
          background: "var(--k-surface)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.18s ease",
        }}
      >
        {/* Nav items */}
        <nav style={{ padding: 8, flex: 1 }}>
          {mainNavItems.map(renderItem)}

          {isAdmin && (
            <>
              <div
                style={{
                  margin: "8px 0",
                  borderTop: "1px solid var(--k-border)",
                }}
              />
              {adminNavItems.map(renderItem)}
            </>
          )}
        </nav>

        {/* Sidebar bottom — language switcher + user menu */}
        <div
          style={{
            borderTop: "1px solid var(--k-border)",
            padding: collapsed ? "8px" : "8px 12px",
          }}
        >
          {!collapsed && (
            <div style={{ marginBottom: 4 }}>
              <LanguageSwitcher />
            </div>
          )}
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>
    </TooltipProvider>
  );
}
