"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Box, GridBackground, WizardHeader } from "@kairo/ui";
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
  /** Centers the column vertically. */
  centered?: boolean;
  /** Without it the header has no Exit: there is nothing left to leave. */
  exit?: boolean;
  /** Panel beside the column on wide screens. */
  aside?: ReactNode;
  /** Names the aside for assistive technology. */
  asideLabel?: string;
  /** Grid background behind the aside. */
  asideGrid?: boolean;
  /** Vertical gap between the blocks of the aside. */
  asideGap?: number;
  children: ReactNode;
}

export function WizardChrome({ stepper, width = 520, gap = 28, centered, exit = true, aside, asideLabel, asideGrid, asideGap = 22, children }: WizardChromeProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const wide = useMinWidth(980);
  const showAside = Boolean(aside) && wide;

  return (
    <Box minHeight="100vh" backgroundColor="var(--kairo-color-bg)" display="flex" flexDirection="column">
      <WizardHeader brand={<KairoLogo size={26} href="/" />} stepper={stepper} exit={exit ? { label: t.wizard.exitSetup, onPress: () => router.push("/") } : undefined} />
      <Box display="flex" flexGrow={1} flexShrink={1} flexBasis="0%">
        <Box tag="main" display="flex" alignItems={centered ? "center" : "flex-start"} justifyContent="center" flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} paddingTop={56} paddingHorizontal={24} paddingBottom={centered ? 56 : 64}>
          <Box width="100%" maxWidth={width} display="flex" flexDirection="column" gap={gap}>
            {children}
          </Box>
        </Box>
        {showAside && (
          <Box tag="aside" aria-label={asideLabel} position="relative" overflow="hidden" flexGrow={1} flexShrink={1} flexBasis={440} maxWidth={600} display="flex" alignItems="center" justifyContent="center" paddingVertical={56} paddingHorizontal={48} backgroundColor="var(--kairo-color-side)" borderLeftWidth={1} borderStyle="solid" borderLeftColor="var(--kairo-color-line)">
            {asideGrid && <GridBackground />}
            <Box position="relative" width="100%" maxWidth={420} display="flex" flexDirection="column" gap={asideGap}>
              {aside}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
