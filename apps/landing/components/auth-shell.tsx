"use client";

import { useTranslation } from "@/lib/i18n";
import { KairoLogo } from "@/components/kairo-logo";
import { LangToggle } from "@/components/lang-toggle";
import Link from "next/link";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Link + label shown at the bottom of the card */
  switchHref: string;
  switchLabel: string;
}

export function AuthShell({
  title,
  subtitle,
  children,
  switchHref,
  switchLabel,
}: AuthShellProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
      }}
    >
      {/* Chrome header */}
      <div
        style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <KairoLogo size={28} href="/" />
        <LangToggle />
      </div>

      {/* Centered card */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 24px 48px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            background: "white",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: 36,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h1
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              margin: "0 0 6px",
              color: "var(--text-primary)",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 14,
              margin: "0 0 24px",
            }}
          >
            {subtitle}
          </p>

          {children}

          {/* Switch link */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: "1px solid var(--border-subtle)",
              fontSize: 13,
              color: "var(--text-secondary)",
              textAlign: "center",
            }}
          >
            <Link
              href={switchHref}
              style={{ color: "var(--accent)", fontWeight: 500 }}
            >
              {switchLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* Footer tagline */}
      <div
        style={{
          padding: 16,
          textAlign: "center",
          fontSize: 11,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {t.login.tagline}
      </div>
    </div>
  );
}
