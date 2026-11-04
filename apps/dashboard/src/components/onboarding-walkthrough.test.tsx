import * as React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";

const completeOnboarding = vi.fn();
const recordOnboardingOffered = vi.fn();
const session = { onboardingPending: true, completeOnboarding, recordOnboardingOffered };

vi.mock("@kairo/client-core/auth", () => ({ useAuth: () => session }));
vi.mock("react-i18next", async () => {
  const en = (await import("@/i18n/resources/en/onboarding.json")).default as Record<string, unknown>;
  return {
    useTranslation: () => ({
      t: (key: string, options?: { returnObjects?: boolean }) => (options?.returnObjects ? en[key] : (en[key] as string) ?? key),
      i18n: { language: "en" },
    }),
  };
});

import { OnboardingWalkthrough } from "./onboarding-walkthrough";

beforeEach(() => {
  completeOnboarding.mockReset().mockResolvedValue(true);
  recordOnboardingOffered.mockReset().mockResolvedValue(undefined);
  session.onboardingPending = true;
});

describe("OnboardingWalkthrough", () => {
  it("is not shown once the onboarding is finished", () => {
    session.onboardingPending = false;
    renderWithProviders(<OnboardingWalkthrough />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("records that the setup was shown, and not when it is not shown", () => {
    session.onboardingPending = false;
    const hidden = renderWithProviders(<OnboardingWalkthrough />);
    expect(recordOnboardingOffered).not.toHaveBeenCalled();
    hidden.unmount();
    session.onboardingPending = true;
    renderWithProviders(<OnboardingWalkthrough />);
    expect(recordOnboardingOffered).toHaveBeenCalledTimes(1);
  });

  it("is a labelled dialog whose controls have names and no industry chosen", () => {
    renderWithProviders(<OnboardingWalkthrough />);
    const dialog = screen.getByRole("dialog", { name: "Before you start" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const industry = screen.getByLabelText("Industry") as HTMLSelectElement;
    expect(industry.value).toBe("");
    expect(Array.from(industry.options).map((option) => option.textContent)).toEqual([
      "Select an industry (optional)", "Customer service", "Financial", "Technology", "Legal", "Accounting", "Other",
    ]);
    expect(screen.getByLabelText("What does your company do? (optional)")).toBeTruthy();
    // The close button of the dialog is named Skip too: closing it is skipping.
    expect(screen.getAllByRole("button", { name: "Skip" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("skips with nothing: no industry and no business context", async () => {
    renderWithProviders(<OnboardingWalkthrough />);
    await userEvent.type(screen.getByLabelText("What does your company do? (optional)"), "typed and then discarded");
    await userEvent.click(screen.getAllByRole("button", { name: "Skip" })[0]);
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({ industry: null, businessContext: "" }));
  });

  it("continues with what was filled in, each part independent of the other", async () => {
    renderWithProviders(<OnboardingWalkthrough />);
    await userEvent.selectOptions(screen.getByLabelText("Industry"), "legal");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({ industry: "legal", businessContext: "" }));
  });

  it("continues with only the business context", async () => {
    renderWithProviders(<OnboardingWalkthrough />);
    await userEvent.type(screen.getByLabelText("What does your company do? (optional)"), "We move freight");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({ industry: null, businessContext: "We move freight" }));
  });

  it("stays open with an error when saving fails, and lets the owner try again or skip", async () => {
    completeOnboarding.mockResolvedValueOnce(false).mockResolvedValue(true);
    renderWithProviders(<OnboardingWalkthrough />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("We could not save your setup. Try again or skip.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(2));
  });
});
