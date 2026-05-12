import Link from "next/link";

interface KairoLogoProps {
  size?: number;
  href?: string;
}

export function KairoLogo({ size = 28, href = "/" }: KairoLogoProps) {
  const inner = (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: "var(--accent)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width={size * 0.55}
          height={size * 0.55}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      </span>
      <span
        style={{
          fontWeight: 600,
          fontSize: 16,
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
