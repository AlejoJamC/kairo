import { Check } from "lucide-react";
import type { WizardStep } from "../types";

const steps = [
  { number: 1 as const, title: "Create Account", description: "Set up your profile" },
  { number: 2 as const, title: "Connect Tools", description: "Link your integrations" },
  { number: 3 as const, title: "Setup Workspace", description: "Configure your environment" },
];

interface WizardLayoutProps {
  currentStep: WizardStep;
  children: React.ReactNode;
}

export function WizardLayout({ currentStep, children }: WizardLayoutProps) {
  const current = steps.find((s) => s.number === currentStep)!;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {steps.map((step, i) => (
            <div key={step.number} className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  step.number < currentStep
                    ? "bg-green-500 text-white"
                    : step.number === currentStep
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {step.number < currentStep ? (
                  <Check size={18} />
                ) : (
                  step.number
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-16 h-0.5 ${
                    step.number < currentStep ? "bg-green-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{current.title}</h1>
            <p className="text-gray-500 mt-1">{current.description}</p>
          </div>
          <div className="animate-fade-in">{children}</div>
        </div>
      </div>
    </div>
  );
}
