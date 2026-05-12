"use client";

import Link from "next/link";
import { KairoLogo } from "@/components/kairo-logo";
import { useTranslation } from "@/lib/i18n";

interface WizardChromeProps {
  children: React.ReactNode;
}

export function WizardChrome({ children }: WizardChromeProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          height: 60,
          borderBottom: "1px solid var(--border)",
          background: "white",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <KairoLogo size={26} href="/" />
        <Link
          href="/"
          style={{
            marginLeft: "auto",
            fontSize: 13,
            color: "var(--text-tertiary)",
            textDecoration: "none",
          }}
        >
          {t.wizard.exitSetup}
        </Link>
      </header>

      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          width: "100%",
          padding: "40px 32px 60px",
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
