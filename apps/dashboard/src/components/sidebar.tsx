import { useRef, useState, useEffect } from "react";
import {
  Home,
  LayoutDashboard,
  Clock,
  RefreshCw,
  ClipboardList,
  AlertTriangle,
  Users,
  Settings,
  Menu,
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
// NavBadge — pill showing ticket count, pulses briefly when count changes
// ---------------------------------------------------------------------------

function NavBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  const prevRef = useRef(count);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (prevRef.current !== count && count > 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      prevRef.current = count;
      return () => clearTimeout(t);
    }
    prevRef.current = count;
  }, [count]);

  if (count === 0) return null;

  const label = count > 99 ? "99+" : String(count);

  if (collapsed) {
    // Small dot overlay on icon (top-right), max "9+" to fit
    const collapsedLabel = count > 9 ? "9+" : String(count);
    return (
      <span
        className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[9px] font-bold text-white leading-none ${
          pulse ? "animate-pulse" : ""
        }`}
      >
        {collapsedLabel}
      </span>
    );
  }

  return (
    <span
      className={`ml-auto rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-300 ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

type NavItem = {
  icon: typeof Home;
  label: string;
  view: AppView;
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

export function Sidebar({ collapsed, onToggle, activeView, onViewChange }: SidebarProps) {
  const { t } = useTranslation(["dashboard"]);
  const { isAdmin } = useAuth();
  const counts = useSidebarCounts();

  const mainNavItems: NavItem[] = [
    { icon: Home,            label: t("dashboard:sidebar.inbox"),          view: "inbox" },
    { icon: LayoutDashboard, label: t("dashboard:sidebar.panel"),          view: "panel" },
    { icon: Clock,           label: t("dashboard:sidebar.pendingClient"),  view: "awaiting" },
    { icon: RefreshCw,       label: t("dashboard:sidebar.autoResolvable"), view: "auto-resolved" },
    { icon: ClipboardList,   label: t("dashboard:sidebar.guided"),         view: "guided" },
    { icon: AlertTriangle,   label: t("dashboard:sidebar.escalation"),     view: "escalated" },
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
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
          collapsed ? "justify-center" : ""
        } ${
          isActive
            ? "bg-zinc-800 text-white"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
        }`}
      >
        <span className="relative shrink-0">
          <item.icon className="h-4 w-4" />
          {collapsed && <NavBadge count={count} collapsed />}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            <NavBadge count={count} collapsed={false} />
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
        className={`flex h-screen flex-col bg-zinc-900 text-white transition-all duration-150 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <button
            onClick={onToggle}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors duration-150"
          >
            <Menu className="h-5 w-5" />
          </button>
          {!collapsed && (
            <span className="text-base font-semibold">Kairo</span>
          )}
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
          {mainNavItems.map(renderItem)}

          {isAdmin && (
            <>
              <div className={`my-2 border-t border-zinc-700 ${collapsed ? "mx-1" : "mx-0"}`} />
              {adminNavItems.map(renderItem)}
            </>
          )}
        </nav>

        <div className="mt-auto">
          {!collapsed && (
            <div className="px-3 pb-2">
              <LanguageSwitcher />
            </div>
          )}
          {!collapsed && <UserMenu />}
        </div>
      </aside>
    </TooltipProvider>
  );
}
