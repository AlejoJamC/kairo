"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Box, WizardHeader } from "@kairo/ui";
import { KairoLogo } from "@/components/kairo-logo";
import { useTranslation } from "@/lib/i18n";

interface WizardChromeProps {
  /** The wizard stepper shown in the header. */
  stepper?: ReactNode;
  children: ReactNode;
}

export function WizardChrome({ stepper, children }: WizardChromeProps) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Box minHeight="100vh" backgroundColor="var(--kairo-color-sunk)" display="flex" flexDirection="column">
      <WizardHeader brand={<KairoLogo size={26} href="/" />} stepper={stepper} exit={{ label: t.wizard.exitSetup, onPress: () => router.push("/") }} />
      <Box maxWidth={720} marginVertical={0} marginHorizontal="auto" width="100%" paddingTop={40} paddingHorizontal={32} paddingBottom={60} flexGrow={1} flexShrink={1} flexBasis="0%">
        {children}
      </Box>
    </Box>
  );
}
