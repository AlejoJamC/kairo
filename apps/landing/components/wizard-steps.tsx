"use client";

import { Stepper } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { useMinWidth } from "@/lib/hooks/useMinWidth";

/** The wizard progress shown in the wizard header. */
export function WizardSteps({ current }: { current: "connect" | "detect" | "triage" }) {
  const { t } = useTranslation();
  const wide = useMinWidth(720, true);

  return (
    <Stepper
      label={t.wizard.stepperLabel}
      current={current}
      doneLabel={t.wizard.stepDone}
      compact={!wide}
      steps={[
        { id: "connect", label: t.wizard.stepConnect },
        { id: "detect", label: t.wizard.stepDetect },
        { id: "triage", label: t.wizard.stepTriage },
      ]}
    />
  );
}
