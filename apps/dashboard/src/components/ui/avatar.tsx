import type { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// Avatar — initials bubble, the single implementation for the whole dashboard.
//
// Before KAI-232 this logic was re-derived in six places (profile settings,
// user menu, top chrome, ticket detail, client profile card, note surfaces),
// each with slightly different initials rules. This is the shared one.
//
// The gradient is derived from the identity string, so the same person keeps
// the same color everywhere without storing anything.
// ---------------------------------------------------------------------------

/**
 * First letter of the first and last word ("Diana Ruiz" → "DR"), a single
 * word's first two letters ("diana" → "DI"), else the email's first letter.
 */
export function getInitials(name?: string | null, email?: string | null): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0]!.slice(0, 2).toUpperCase();
    }
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  const fallback = email?.trim();
  return fallback ? fallback[0]!.toUpperCase() : "?";
}

// Fixed palette so avatars stay inside the product's visual grammar instead of
// generating arbitrary hues. Mirrors the design mock's gradient set.
const GRADIENTS = [
  "linear-gradient(135deg,#BFDBFE,#3B82F6)",
  "linear-gradient(135deg,#A7F3D0,#10B981)",
  "linear-gradient(135deg,#FDE68A,#F59E0B)",
  "linear-gradient(135deg,#C4B5FD,#8B5CF6)",
  "linear-gradient(135deg,#FBCFE8,#EC4899)",
  "linear-gradient(135deg,#FDE68A,#FB923C)",
  "linear-gradient(135deg,#FFB199,#FF6E7F)",
  "linear-gradient(135deg,#C7D2FE,#6366F1)",
] as const;

/** Stable index from an identity string — same person, same color, always. */
function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!;
}

export interface AvatarProps {
  name?: string | null;
  email?: string | null;
  /** Identity used to pick the gradient. Defaults to email, then name. */
  seed?: string | null;
  size?: number;
  /** Accent ring — marks an unread mention on a note card (KAI-232 spec B4). */
  ring?: boolean;
  /** Overrides the derived gradient (e.g. the accent-blue "you" avatar). */
  background?: string;
  style?: CSSProperties;
}

export function Avatar({
  name,
  email,
  seed,
  size = 24,
  ring = false,
  background,
  style,
}: AvatarProps) {
  const identity = seed ?? email ?? name ?? "";
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: background ?? gradientFor(identity),
        color: "white",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(9, size * 0.42),
        fontWeight: 600,
        letterSpacing: "-0.02em",
        boxShadow: ring ? "0 0 0 2px white, 0 0 0 3.5px var(--k-accent)" : "none",
        ...style,
      }}
    >
      {getInitials(name, email)}
    </div>
  );
}
