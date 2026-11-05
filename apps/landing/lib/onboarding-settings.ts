import { isIndustryChoice, type IndustryChoice } from "@kairo/types/industry";

/** What the owner can tell Kairo about the business while onboarding. Both parts are optional. */
export interface OnboardingSettings {
  industry: IndustryChoice | null;
  businessContext: string;
}

export const EMPTY_SETTINGS: OnboardingSettings = { industry: null, businessContext: "" };

export function hasSettings(settings: OnboardingSettings): boolean {
  return settings.industry !== null || settings.businessContext.trim() !== "";
}

/** The select reports "" when nothing is chosen. */
export function industryFromSelect(value: string): IndustryChoice | null {
  return isIndustryChoice(value) ? value : null;
}

export function completionBody(settings: OnboardingSettings): { industry: IndustryChoice | null; business_context: string | null } {
  return { industry: settings.industry, business_context: settings.businessContext.trim() || null };
}
