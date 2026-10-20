"use client";

import { WizardChrome } from "@/components/wizard-chrome";
import { WizardSteps } from "@/components/wizard-steps";
import { DetectPageClient } from "./_client";
import { Box } from "@kairo/ui";

export default function DetectPage() {
  return (
    <WizardChrome stepper={<WizardSteps current="detect" />}>
      <Box backgroundColor="var(--kairo-color-surface)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={14} padding={40}>
        <DetectPageClient />
      </Box>
    </WizardChrome>
  );
}
