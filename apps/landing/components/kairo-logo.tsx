import Link from "next/link";
import { Zap } from "lucide-react";

interface KairoLogoProps {
  size?: number;
  href?: string;
}

export function KairoLogo({ size = 28, href = "/" }: KairoLogoProps) {
  const iconSize = Math.round(size * 0.55);

  const inner = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Zap size={iconSize} color="white" strokeWidth={2.5} />
      </span>
      <span
        style={{
          fontWeight: 600,
          fontSize: size * 0.6,
          letterSpacing: "-0.01em",
          color: "var(--text-primary)",
        }}
      >
        Kairo
      </span>
    </span>
  );

  return href ? (
    <Link href={href} style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
