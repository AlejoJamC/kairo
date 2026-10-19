"use client";

import { SiteFooter } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { KairoLogo } from "@/components/kairo-logo";

export function Footer() {
  const { t } = useTranslation();

  return (
    <SiteFooter
      brand={<KairoLogo size={28} href="/" />}
      description={t.landing.footerTagline}
      note={t.landing.footerBuilt}
      columns={[
        {
          title: t.landing.footerColProduct,
          links: [
            { label: "Cockpit", href: "#" },
            { label: "Triage Engine", href: "#" },
            { label: "KB & Embeddings", href: "#" },
            { label: "API", href: "#" },
          ],
        },
        {
          title: t.landing.footerColResources,
          links: [
            { label: "Docs", href: "#" },
            { label: "Changelog", href: "#" },
            { label: "Status", href: "#" },
            { label: "Brand", href: "#" },
          ],
        },
        {
          title: t.landing.footerColCompany,
          links: [
            { label: "About", href: "#" },
            { label: "Careers", href: "#" },
            { label: "Contact", href: "#" },
          ],
        },
        {
          title: "Legal",
          links: [
            { label: t.footer.privacy, href: "/privacy" },
            { label: t.footer.terms, href: "/terms" },
            { label: "DPA", href: "#" },
            { label: "SOC 2", href: "#" },
          ],
        },
      ]}
      copyright={t.landing.footerCopyright}
      version={t.landing.footerVersion}
    />
  );
}
