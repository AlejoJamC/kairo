"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KairoLogo, TopNav } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { AppLink } from "@/components/app-link";
import { LangToggle } from "@/components/lang-toggle";

export function Header() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <TopNav
      label={t.header.navLabel}
      brand={<AppLink href="/"><KairoLogo size={26} /></AppLink>}
      links={[
        { id: "how", label: t.header.navHow, href: "/#como" },
        { id: "channels", label: t.header.navChannels, href: "/#canales" },
        { id: "data", label: t.header.navData, href: "/#datos" },
        { id: "pricing", label: t.header.navPricing, href: "/pricing" },
      ]}
      language={<LangToggle />}
      menu={{ label: t.header.menu, open, onToggle: () => setOpen((value) => !value) }}
      signIn={{ label: t.header.login, href: "/login" }}
      cta={{ label: t.header.getStarted, onPress: () => router.push("/wizard") }}
    />
  );
}
