import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { UiProvider } from "@kairo/ui";

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>{children}</UiProvider>
  );
}

function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { renderWithProviders };
