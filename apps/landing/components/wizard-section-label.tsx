"use client";

import { Text } from "@kairo/ui";

/** The small mono label that titles a block of a wizard step. */
export function WizardSectionLabel({ children }: { children: string }) {
  return (
    <Text tag="span" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color="var(--kairo-color-faint)">
      {children}
    </Text>
  );
}
