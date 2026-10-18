// UserMenu — compact profile row at sidebar bottom.
// Light-theme restyle (KAI-156); supports collapsed mode (icon only).

import { LogOut } from "lucide-react";
import { useAuth } from "@kairo/client-core/auth";
import { Avatar } from "@kairo/ui";

interface UserMenuProps {
  collapsed?: boolean;
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const { profile, signOut } = useAuth();

  if (!profile) return null;

  const displayName = profile.name || profile.email;

  if (collapsed) {
    return (
      <div title={displayName ?? ""} style={{ display: "flex", justifyContent: "center" }}>
        <Avatar name={profile.name} email={profile.email} size={28} />
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
      <Avatar name={profile.name} email={profile.email} size={24} marginLeft={4} />

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
        {/* Gmail connected badge moved to Channels settings (KAI-173) */}
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
