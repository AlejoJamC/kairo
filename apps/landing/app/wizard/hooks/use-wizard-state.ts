"use client";

import { useState, useEffect, useCallback } from "react";
import type { WizardStep, FormData } from "../types";

const STORAGE_KEY = "kairo-onboarding";

const initialFormData: FormData = {
  name: "",
  email: "",
  company: "",
  connectedProviders: [],
};

export function useWizardState() {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.currentStep) setCurrentStep(parsed.currentStep);
        if (parsed.formData) setFormData(parsed.formData);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ currentStep, formData })
    );
  }, [currentStep, formData, hydrated]);

  const nextStep = useCallback(() => {
    setCurrentStep((s) => (s < 3 ? ((s + 1) as WizardStep) : s));
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s));
  }, []);

  const updateFormData = useCallback((updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const reset = useCallback(() => {
    setCurrentStep(1);
    setFormData(initialFormData);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    currentStep,
    formData,
    hydrated,
    nextStep,
    prevStep,
    updateFormData,
    reset,
  };
}
