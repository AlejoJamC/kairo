"use client";

import type { ReactNode } from "react";
import { AuthFooter, AuthHeader, AuthLayout, KairoLogo } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { AppLink } from "@/components/app-link";
import { LangToggle } from "@/components/lang-toggle";

/** The page of the sign-in, invitation and password screens: header, centered column and reduced footer. */
export function AuthPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();

  return (
    <AuthLayout
      wide={wide}
      header={<AuthHeader brand={<AppLink href="/"><KairoLogo size={28} /></AppLink>} language={<LangToggle />} />}
      footer={
        <AuthFooter
          links={[
            { label: t.footer.terms, href: "/terms" },
            { label: t.footer.privacy, href: "/privacy" },
          ]}
          copyright={t.footer.copyright}
        />
      }
    >
      {children}
    </AuthLayout>
  );
}
