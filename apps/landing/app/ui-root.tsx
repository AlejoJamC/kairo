"use client";

import type { ReactNode } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { UiProvider, getUiCss } from "@kairo/ui";

/** Mounts the UI provider and injects the styles rendered on the server, so the first paint is styled. */
export function UiRoot({ children }: { children: ReactNode }) {
  useServerInsertedHTML(() => <style id="kairo-ui" dangerouslySetInnerHTML={{ __html: getUiCss() }} />);
  return <UiProvider>{children}</UiProvider>;
}
