"use client";

import { useSyncExternalStore } from "react";

/** True while the viewport is at least `width` px wide; false on the server. */
export function useMinWidth(width: number): boolean {
  const query = `(min-width: ${width}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
