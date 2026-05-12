"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { KairoLogo } from "@/components/kairo-logo";
import { LangToggle } from "@/components/lang-toggle";

export function Header() {
  const { t } = useTranslation();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 64,
        borderBottom: "1px solid var(--border-subtle)",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          height: "100%",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          gap: 32,
        }}
      >
        <KairoLogo size={26} href="/" />

        <nav
          style={{
            display: "flex",
            gap: 24,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          {[
            { label: t.header.navProduct, href: "#product" },
            { label: t.header.navPricing, href: "/pricing" },
            { label: t.header.navDocs, href: "#" },
            { label: t.header.navChangelog, href: "#" },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              style={{
                color: "var(--text-secondary)",
                textDecoration: "none",
                transition: "color 0.12s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <LangToggle />
          <Link
            href="/login"
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            {t.header.login}
          </Link>
          <Link
            href="/wizard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: "var(--accent)",
              color: "white",
              borderRadius: "var(--radius-input)",
              textDecoration: "none",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent)";
            }}
          >
            {t.header.getStarted}
          </Link>
        </div>
      </div>
    </header>
  );
}
