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
import type { AppView } from "@/types";

type NavItem = {
  icon: typeof Home;
  label: string;
  view: AppView;
  count?: number;
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

  const mainNavItems: NavItem[] = [
    { icon: Home,           label: t("dashboard:sidebar.inbox"),         view: "inbox" },
    { icon: LayoutDashboard,label: t("dashboard:sidebar.panel"),         view: "panel" },
    { icon: Clock,          label: t("dashboard:sidebar.pendingClient"), view: "awaiting" },
    { icon: RefreshCw,      label: t("dashboard:sidebar.autoResolvable"),view: "auto-resolved" },
    { icon: ClipboardList,  label: t("dashboard:sidebar.guided"),        view: "guided" },
    { icon: AlertTriangle,  label: t("dashboard:sidebar.escalation"),    view: "escalated" },
  ];

  const adminNavItems: NavItem[] = [
    { icon: Users,    label: t("dashboard:sidebar.clients"),  view: "clients" },
    { icon: Settings, label: t("dashboard:sidebar.settings"), view: "settings" },
  ];

  const renderItem = (item: NavItem) => {
    const isActive = item.view === activeView;
    return (
      <button
        key={item.view}
        onClick={() => onViewChange(item.view)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
          collapsed ? "justify-center" : ""
        } ${
          isActive
            ? "bg-zinc-800 text-white"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
        }`}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {item.count !== undefined && (
              <span className="text-xs text-zinc-500">({item.count})</span>
            )}
          </>
        )}
      </button>
    );
  };

  return (
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
  );
}
