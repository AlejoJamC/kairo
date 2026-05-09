// Top chrome — 56 px header bar: logo/toggle | search | bell + avatar
// Matches cockpit.jsx lines 101–136 from packages/claude_design.

import { Search, Bell, PanelLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface TopChromeProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function TopChrome({ collapsed, onToggle }: TopChromeProps) {
  const { profile } = useAuth();

  // Derive two-letter initials from display name, fall back to first letter of email
  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((p: string) => p[0] ?? "")
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (profile?.email?.[0] ?? "U").toUpperCase();

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 16,
        background: "var(--k-bg)",
        borderBottom: "1px solid var(--k-border)",
      }}
    >
      {/* Logo + sidebar-toggle — width tracks sidebar */}
      <div
        style={{
          width: collapsed ? 40 : 208,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          flexShrink: 0,
          transition: "width 0.18s ease",
        }}
      >
        {!collapsed && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--k-text-primary)",
              fontFamily: "var(--k-font-display)",
              letterSpacing: "-0.01em",
            }}
          >
            Kairo
          </span>
        )}
        <button
          onClick={onToggle}
          aria-label="Toggle sidebar"
          style={{
            padding: 6,
            color: "var(--k-text-tertiary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
          }}
        >
          <PanelLeft size={16} />
        </button>
      </div>

      {/* Command-palette style search — max 480 px, h 34 */}
      <div
        style={{
          flex: 1,
          maxWidth: 480,
          height: 34,
          border: "1px solid var(--k-border)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 8,
          background: "var(--k-surface)",
          color: "var(--k-text-tertiary)",
          fontSize: 13,
        }}
      >
        <Search size={14} />
        <span style={{ flex: 1 }}>Search tickets, clients, KB…</span>
        <kbd
          style={{
            fontFamily: "var(--k-font-mono)",
            fontSize: 11,
            padding: "1px 6px",
            background: "var(--k-bg)",
            border: "1px solid var(--k-border)",
            borderRadius: 4,
            color: "var(--k-text-tertiary)",
          }}
        >
          ⌘K
        </kbd>
      </div>

      {/* Right actions — bell + avatar */}
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          aria-label="Notifications"
          style={{
            padding: 6,
            color: "var(--k-text-secondary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            position: "relative",
            display: "flex",
            alignItems: "center",
            borderRadius: 6,
          }}
        >
          <Bell size={18} />
          {/* Notification dot */}
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#EF4444",
            }}
          />
        </button>

        <div
          style={{
            paddingLeft: 8,
            borderLeft: "1px solid var(--k-border)",
            display: "flex",
            alignItems: "center",
          }}
        >
          {/* Avatar — initials, uses ai-glow gradient */}
          <div
            title={profile?.name ?? profile?.email ?? ""}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2B5BFF 0%, #6E8BFF 100%)",
              color: "white",
              fontSize: 11,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              userSelect: "none",
            }}
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
