import { getPlatform } from "@kairo/client-core/config";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// ---------------------------------------------------------------------------
// useResizablePanel — size, limits and persistence for the Triage right panel.
// The drag handle itself is the shared `Resizer` from @kairo/ui.
//
// The panel is pinned to the right edge of its flex row (`<main>`), so widening
// it steals width from the CENTER column only — the left rail + ticket list are
// never touched. Width is clamped between a fixed floor and a computed ceiling
// and persisted across reloads.
//
// Ceiling (computed, not a magic number):
//   max = clamp(containerWidth − reserveLeft − centerMin, min, cap)
//   · reserveLeft  → the fixed ticket-list column to the panel's left
//   · centerMin    → the smallest comfortable width for the email/composer
//                    column (readability floor — keep its content legible)
//   · cap          → absolute upper bound; a reading/chat column wider than
//                    this hurts scannability (optimal line-length best practice)
// The ceiling adapts live to the viewport and to the sidebar collapsing,
// because `containerWidth` is measured from the panel's parent.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "kairo.rightPanelWidth";

interface ResizablePanelOptions {
  /** Fixed floor — the panel never shrinks below this (the current design width). */
  min: number;
  /** Absolute ceiling regardless of how wide the viewport is. */
  cap: number;
  /** Fixed width occupying space to the panel's left inside the same flex row. */
  reserveLeft: number;
  /** Minimum width the center column must keep so it stays usable. */
  centerMin: number;
}

interface ResizablePanel {
  panelRef: RefObject<HTMLDivElement | null>;
  width: number;
  /** Live ceiling for the current viewport. */
  max: number;
  setWidth: (width: number) => void;
  /** Persist the settled width. */
  commit: (width: number) => void;
  /** Reset to the floor (used on double-click of the handle). */
  reset: () => void;
}

function readStored(min: number): number {
  try {
    const saved = Number(getPlatform().storage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) && saved >= min ? saved : min;
  } catch {
    return min;
  }
}

function persist(width: number): void {
  try {
    getPlatform().storage.setItem(STORAGE_KEY, String(Math.round(width)));
  } catch {
    /* storage unavailable — width simply won't survive reload */
  }
}

export function useResizablePanel({ min, cap, reserveLeft, centerMin }: ResizablePanelOptions): ResizablePanel {
  const panelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(() => readStored(min));

  const maxFor = useCallback(
    (containerWidth: number) => Math.max(min, Math.min(cap, containerWidth - reserveLeft - centerMin)),
    [min, cap, reserveLeft, centerMin],
  );

  const clampToContainer = useCallback(
    (next: number): number => {
      const parent = panelRef.current?.parentElement;
      const containerWidth = parent?.clientWidth ?? window.innerWidth;
      return Math.min(Math.max(next, min), maxFor(containerWidth));
    },
    [maxFor, min],
  );

  // Re-clamp when the window or the sidebar changes the space the row has.
  useEffect(() => {
    const parent = panelRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => setWidth((w) => clampToContainer(w)));
    observer.observe(parent);
    return () => observer.disconnect();
  }, [clampToContainer]);

  const reset = useCallback(() => {
    const next = clampToContainer(min);
    setWidth(next);
    persist(next);
  }, [clampToContainer, min]);

  const [max, setMax] = useState<number>(cap);
  useLayoutEffect(() => {
    const parent = panelRef.current?.parentElement;
    const ceiling = maxFor(parent?.clientWidth ?? window.innerWidth);
    setMax(ceiling);
    // A stored width that no longer fits (a smaller window, a sidebar that opened) is brought back under the ceiling.
    setWidth((current) => Math.min(Math.max(current, min), ceiling));
  }, [maxFor, width, min]);

  const commit = useCallback((next: number) => persist(next), []);

  return { panelRef, width, max, setWidth, commit, reset };
}
