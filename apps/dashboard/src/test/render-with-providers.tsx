import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { TamaguiProvider } from "@tamagui/core";
import tamaguiConfig from "@kairo/ui/tamagui.config";

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      {children}
    </TamaguiProvider>
  );
}

function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { renderWithProviders };
