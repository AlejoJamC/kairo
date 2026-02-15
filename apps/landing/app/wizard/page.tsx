"use client";

import { useWizardState } from "./hooks/use-wizard-state";
import { WizardLayout } from "./components/wizard-layout";
import { Step1Account } from "./components/step-1-account";
import { Step2OAuth } from "./components/step-2-oauth";
import { Step3Processing } from "./components/step-3-processing";

export default function WizardPage() {
  const { currentStep, formData, hydrated, nextStep, prevStep, updateFormData } =
    useWizardState();

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <WizardLayout currentStep={currentStep}>
      {currentStep === 1 && (
        <Step1Account
          formData={formData}
          onUpdate={updateFormData}
          onNext={nextStep}
        />
      )}
      {currentStep === 2 && (
        <Step2OAuth
          formData={formData}
          onUpdate={updateFormData}
          onNext={nextStep}
          onBack={prevStep}
        />
      )}
      {currentStep === 3 && <Step3Processing />}
    </WizardLayout>
  );
}
