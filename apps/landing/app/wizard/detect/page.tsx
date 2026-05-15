import { WizardChrome } from "@/components/wizard-chrome";
import { WizardStepper } from "@/components/wizard-stepper";
import { DetectPageClient } from "./_client";

export default function DetectPage() {
  return (
    <WizardChrome>
      <WizardStepper
        steps={["Conectar", "Detectar", "Triage"]}
        current={1}
      />
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 40 }}>
        <DetectPageClient />
      </div>
    </WizardChrome>
  );
}
