"use client";

import { WizardChrome } from "@/components/wizard-chrome";
import { WizardSteps } from "@/components/wizard-steps";
import { DetectPageClient } from "./_client";

export default function DetectPage() {
  return (
    <WizardChrome stepper={<WizardSteps current="detect" />} width={760}>
      <DetectPageClient />
    </WizardChrome>
  );
}
