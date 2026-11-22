"use client";

import { Box, KairoLogo, SiteFooter, Text } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { AppLink } from "@/components/app-link";

export function Footer() {
  const { t } = useTranslation();

  return (
    <SiteFooter
      brand={
        <Box>
          <AppLink href="/"><KairoLogo size={28} /></AppLink>
          <Text tag="p" display="block" margin={0} marginTop={12} fontSize={14} fontWeight={600}>
            {t.landing.footerSlogan}
          </Text>
        </Box>
      }
      description={t.landing.footerTagline}
      note={t.landing.footerBuilt}
      columns={[
        {
          title: t.landing.footerColProduct,
          links: [
            { label: t.header.navHow, href: "/#como" },
            { label: t.header.navChannels, href: "/#canales" },
            { label: t.header.navPricing, href: "/pricing" },
          ],
        },
        {
          title: t.landing.footerColLegal,
          links: [
            { label: t.footer.privacy, href: "/privacy" },
            { label: t.footer.terms, href: "/terms" },
          ],
        },
        {
          title: t.landing.footerColContact,
          links: [{ label: "get.kairo.ai@gmail.com", href: "mailto:get.kairo.ai@gmail.com" }],
        },
      ]}
      copyright={t.landing.footerCopyright}
    />
  );
}
