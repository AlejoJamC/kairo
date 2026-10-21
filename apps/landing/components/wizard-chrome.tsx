"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Box, WizardHeader } from "@kairo/ui";
import { KairoLogo } from "@/components/kairo-logo";
import { useTranslation } from "@/lib/i18n";
import { useMinWidth } from "@/lib/hooks/useMinWidth";

interface WizardChromeProps {
  /** The wizard stepper shown in the header. */
  stepper?: ReactNode;
  /** Preview shown beside the content on wide screens. */
  aside?: ReactNode;
  children: ReactNode;
}

export function WizardChrome({ stepper, aside, children }: WizardChromeProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const wide = useMinWidth(980);
  const showAside = Boolean(aside) && wide;

  return (
    <Box minHeight="100vh" backgroundColor="var(--kairo-color-sunk)" display="flex" flexDirection="column">
      <WizardHeader brand={<KairoLogo size={26} href="/" />} stepper={stepper} exit={{ label: t.wizard.exitSetup, onPress: () => router.push("/") }} />
      <Box maxWidth={showAside ? 1240 : 720} marginVertical={0} marginHorizontal="auto" width="100%" paddingTop={40} paddingHorizontal={32} paddingBottom={60} flexGrow={1} flexShrink={1} flexBasis="0%">
        {showAside ? (
          <Box grid gridTemplateColumns="minmax(0, 720px) minmax(0, 1fr)" gap={32} alignItems="flex-start">
            <Box minWidth={0}>{children}</Box>
            <Box backgroundColor="var(--kairo-color-side)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={14} padding={24}>
              {aside}
            </Box>
          </Box>
        ) : (
          children
        )}
      </Box>
    </Box>
  );
}
