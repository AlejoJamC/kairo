import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UiProvider } from "@kairo/ui";
import { OnboardingSettingsFields } from "./onboarding-settings-fields";
import { EMPTY_SETTINGS } from "@/lib/onboarding-settings";

const html = (industry: "legal" | null) =>
  renderToStaticMarkup(
    <UiProvider>
      <OnboardingSettingsFields settings={{ ...EMPTY_SETTINGS, industry }} onChange={() => {}} />
    </UiProvider>,
  );

describe("OnboardingSettingsFields", () => {
  it("lists the five industries and Other, with nothing selected by default", () => {
    const markup = html(null);
    for (const name of ["Customer service", "Financial", "Technology", "Legal", "Accounting", "Other"]) expect(markup).toContain(name);
    expect(markup).toContain("Select an industry (optional)");
    expect(markup).toContain('<option value="" selected="">Select an industry (optional)</option>');
    expect(markup.match(/selected=/g)).toHaveLength(1);
  });

  it("offers the optional business context", () => {
    expect(html(null)).toContain("What does your company do? (optional)");
  });
});
