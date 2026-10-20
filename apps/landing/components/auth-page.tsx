"use client";

import type { ReactNode } from "react";
import { AuthFooter, AuthHeader, AuthLayout } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { KairoLogo } from "@/components/kairo-logo";
import { LangToggle } from "@/components/lang-toggle";

/** The page of the sign-in, invitation and password screens: header, centered column and reduced footer. */
export function AuthPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();

  return (
    <AuthLayout
      wide={wide}
      header={<AuthHeader brand={<KairoLogo size={28} href="/" />} language={<LangToggle />} />}
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
