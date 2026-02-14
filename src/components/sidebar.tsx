import {
  Home,
  LayoutDashboard,
  Bot,
  FileText,
  AlertTriangle,
  Settings,
  ChevronDown,
} from "lucide-react";

const navItems = [
  { icon: Home, label: "Inbox", active: true },
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Bot, label: "Auto Resolvable", count: 14 },
  { icon: FileText, label: "Guided", count: 10 },
  { icon: AlertTriangle, label: "Escalation", count: 8 },
  { icon: Settings, label: "Views", hasChevron: true },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-col bg-zinc-900 text-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700">
          <Bot className="h-5 w-5" />
        </div>
        <span className="text-base font-semibold">AI Support Cockpit</span>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              item.active
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.count !== undefined && (
              <span className="text-xs text-zinc-500">({item.count})</span>
            )}
            {item.hasChevron && (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}
