// UserMenu — compact profile row at sidebar bottom.
// Light-theme restyle (KAI-156); supports collapsed mode (icon only).

import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface UserMenuProps {
  collapsed?: boolean;
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const { profile, signOut } = useAuth();

  if (!profile) return null;

  const displayName = profile.name || profile.email;
  const initials = profile.name
    ? profile.name
        .split(" ")
        .map((p: string) => p[0] ?? "")
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (profile.email?.[0] ?? "U").toUpperCase();

  if (collapsed) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          title={displayName ?? ""}
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
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 4px",
        borderRadius: 6,
        background: "var(--k-bg)",
        border: "1px solid var(--k-border)",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #2B5BFF 0%, #6E8BFF 100%)",
          color: "white",
          fontSize: 10,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginLeft: 4,
          userSelect: "none",
        }}
      >
        {initials}
      </div>

      {/* Name + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--k-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            margin: 0,
          }}
        >
          {displayName}
        </p>
        {profile.gmail_connected && (
          <p style={{ fontSize: 10, color: "#10B981", margin: 0 }}>Gmail connected</p>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        title="Sign out"
        style={{
          padding: 4,
          color: "var(--k-text-tertiary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          marginRight: 2,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--k-text-primary)";
          (e.currentTarget as HTMLButtonElement).style.background = "var(--k-surface-2)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--k-text-tertiary)";
          (e.currentTarget as HTMLButtonElement).style.background = "none";
        }}
      >
        <LogOut style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}
