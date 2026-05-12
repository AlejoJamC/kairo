"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { KairoLogo } from "@/components/kairo-logo";

export function Footer() {
  const { t } = useTranslation();

  const columns = [
    {
      heading: t.landing.footerColProduct,
      items: [
        { label: "Cockpit", href: "#" },
        { label: "Triage Engine", href: "#" },
        { label: "KB & Embeddings", href: "#" },
        { label: "API", href: "#" },
      ],
    },
    {
      heading: t.landing.footerColResources,
      items: [
        { label: "Docs", href: "#" },
        { label: "Changelog", href: "#" },
        { label: "Status", href: "#" },
        { label: "Brand", href: "#" },
      ],
    },
    {
      heading: t.landing.footerColCompany,
      items: [
        { label: "About", href: "#" },
        { label: "Careers", href: "#" },
        { label: "Contact", href: "#" },
      ],
    },
    {
      heading: "Legal",
      items: [
        { label: t.footer.privacy, href: "/privacy" },
        { label: t.footer.terms, href: "/terms" },
        { label: "DPA", href: "#" },
        { label: "SOC 2", href: "#" },
      ],
    },
  ];

  return (
    <footer
      style={{
        padding: "64px 32px 48px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
          gap: 48,
        }}
      >
        {/* Brand column */}
        <div>
          <KairoLogo size={28} href="/" />
          <p
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              margin: "14px 0 0",
              maxWidth: 280,
              lineHeight: 1.55,
            }}
          >
            {t.landing.footerTagline}
          </p>
          <div
            style={{
              marginTop: 20,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
            }}
          >
            {t.landing.footerBuilt}
          </div>
        </div>

        {/* Nav columns */}
        {columns.map((col) => (
          <div key={col.heading}>
            <div
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 14,
              }}
            >
              {col.heading}
            </div>
            {col.items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  padding: "5px 0",
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
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom strip */}
      <div
        style={{
          maxWidth: 1280,
          margin: "40px auto 0",
          paddingTop: 24,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span>{t.landing.footerCopyright}</span>
        <span>{t.landing.footerVersion}</span>
      </div>
    </footer>
  );
}
