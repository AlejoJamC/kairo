import {
  Home,
  LayoutDashboard,
  Bot,
  FileText,
  AlertTriangle,
  Settings,
  ChevronDown,
  Menu,
} from "lucide-react";

const navItems = [
  { icon: Home, label: "Inbox", active: true },
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Bot, label: "Auto Resolvable", count: 14 },
  { icon: FileText, label: "Guided", count: 10 },
  { icon: AlertTriangle, label: "Escalation", count: 8 },
  { icon: Settings, label: "Views", hasChevron: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
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
          <span className="text-base font-semibold">AI Support Cockpit</span>
        )}
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
              collapsed ? "justify-center" : ""
            } ${
              item.active
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
        ))}
      </nav>
    </aside>
  );
}
