import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UiProvider } from "@kairo/ui";
import type { ReactNode } from "react";

mock.module("@/lib/hooks/useClassificationProgress", () => ({
  CLASSIFICATION_FAILED: "classification_failed",
  useClassificationProgress: () => ({ data: null, error: null, retry: () => {} }),
}));

const page = (node: ReactNode) => renderToStaticMarkup(<UiProvider>{node}</UiProvider>);
const { DetectionStep } = await import("./detection-step");

describe("DetectionStep", () => {
  it("has a link to the optional last step, with no setup fields", () => {
    const html = page(<DetectionStep onContinue={() => {}} onPersonalize={() => {}} />);
    expect(html).toContain("Personalize my setup (optional)");
    expect(html).not.toContain("Select an industry");
    expect(html).not.toContain("What does your company do?");
  });

  it("omits the link where there is no last step to go to", () => {
    expect(page(<DetectionStep onContinue={() => {}} />)).not.toContain("Personalize my setup");
  });
});
