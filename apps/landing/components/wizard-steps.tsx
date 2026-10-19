"use client";

import { Stepper } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";

/** The wizard progress shown in the wizard header. */
export function WizardSteps({ current }: { current: "connect" | "detect" | "triage" }) {
  const { t } = useTranslation();

  return (
    <Stepper
      label={t.wizard.stepperLabel}
      current={current}
      steps={[
        { id: "connect", label: t.wizard.stepConnect },
        { id: "detect", label: t.wizard.stepDetect },
        { id: "triage", label: t.wizard.stepTriage },
      ]}
    />
  );
}
