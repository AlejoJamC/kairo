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
  /** Width of the content column. */
  width?: number;
  /** Vertical gap between the blocks of the column. */
  gap?: number;
  /** Panel beside the column on wide screens. */
  aside?: ReactNode;
  children: ReactNode;
}

export function WizardChrome({ stepper, width = 520, gap = 28, aside, children }: WizardChromeProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const wide = useMinWidth(980);
  const showAside = Boolean(aside) && wide;

  return (
    <Box minHeight="100vh" backgroundColor="var(--kairo-color-bg)" display="flex" flexDirection="column">
      <WizardHeader brand={<KairoLogo size={26} href="/" />} stepper={stepper} exit={{ label: t.wizard.exitSetup, onPress: () => router.push("/") }} />
      <Box display="flex" flexGrow={1} flexShrink={1} flexBasis="0%">
        <Box tag="main" display="flex" justifyContent="center" flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} paddingTop={56} paddingHorizontal={24} paddingBottom={64}>
          <Box width="100%" maxWidth={width} display="flex" flexDirection="column" gap={gap}>
            {children}
          </Box>
        </Box>
        {showAside && (
          <Box tag="aside" flexGrow={1} flexShrink={1} flexBasis={440} maxWidth={600} display="flex" alignItems="center" justifyContent="center" paddingVertical={56} paddingHorizontal={48} backgroundColor="var(--kairo-color-side)" borderLeftWidth={1} borderStyle="solid" borderLeftColor="var(--kairo-color-line)">
            <Box width="100%" maxWidth={420} display="flex" flexDirection="column" gap={22}>
              {aside}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
