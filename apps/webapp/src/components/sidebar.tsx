import {
    Home,
    LayoutDashboard,
    Bot,
    FileText,
    AlertTriangle,
    Settings,
    ChevronDown,
    Menu,
    Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import type { AppView } from "@/types";

type NavItem = {
  icon: typeof Home;
  label: string;
  view?: AppView;
  count?: number;
  hasChevron?: boolean;
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

export function Sidebar({ collapsed, onToggle, activeView, onViewChange }: SidebarProps) {
  const { t } = useTranslation(["common", "dashboard"]);

  const navItems: NavItem[] = [
    { icon: Home, label: t("dashboard:sidebar.inbox"), view: "inbox" },
    { icon: LayoutDashboard, label: t("dashboard:title") },
    { icon: Bot, label: t("dashboard:sidebar.autoResolvable"), count: 14 },
    { icon: FileText, label: t("dashboard:sidebar.guided"), count: 10 },
    { icon: AlertTriangle, label: t("dashboard:sidebar.escalation"), count: 8 },
    { icon: Users, label: t("dashboard:sidebar.clients"), view: "clients" },
    { icon: Settings, label: t("dashboard:sidebar.settings"), hasChevron: true },
  ];

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
          <span className="text-base font-semibold">{t("common:appName")}</span>
        )}
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
        {navItems.map((item) => {
          const isActive = item.view !== undefined && item.view === activeView;
          return (
            <button
              key={item.label}
              onClick={() => item.view && onViewChange(item.view)}
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
                  {item.hasChevron && (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  )}
                </>
              )}
            </button>
          );
        })}
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
