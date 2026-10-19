"use client";

import { useRouter } from "next/navigation";
import { TopNav } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { KairoLogo } from "@/components/kairo-logo";
import { LangToggle } from "@/components/lang-toggle";

export function Header() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <TopNav
      label={t.header.navLabel}
      brand={<KairoLogo size={26} href="/" />}
      links={[
        { id: "product", label: t.header.navProduct, href: "#product" },
        { id: "pricing", label: t.header.navPricing, href: "/pricing" },
        { id: "docs", label: t.header.navDocs, href: "#" },
        { id: "changelog", label: t.header.navChangelog, href: "#" },
      ]}
      language={<LangToggle />}
      signIn={{ label: t.header.login, href: "/login" }}
      cta={{ label: t.header.getStarted, onPress: () => router.push("/wizard") }}
    />
  );
}
