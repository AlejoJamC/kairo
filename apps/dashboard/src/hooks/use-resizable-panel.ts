import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// ---------------------------------------------------------------------------
// useResizablePanel — drag-to-resize for the Triage right panel (KAI-249)
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
  onHandleMouseDown: (e: React.MouseEvent) => void;
  /** Reset to the floor (used on double-click of the handle). */
  reset: () => void;
}

function readStored(min: number): number {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) && saved >= min ? saved : min;
  } catch {
    return min;
  }
}

function persist(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
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

  // Re-clamp when the viewport (or sidebar) changes the available space.
  useEffect(() => {
    function onResize() {
      setWidth((w) => clampToContainer(w));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToContainer]);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const parent = panelRef.current?.parentElement;
      if (!parent) return;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function onMove(ev: MouseEvent) {
        const rect = parent!.getBoundingClientRect();
        const next = Math.min(Math.max(rect.right - ev.clientX, min), maxFor(rect.width));
        setWidth(next);
      }
      function onUp() {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setWidth((w) => { persist(w); return w; });
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [maxFor, min],
  );

  const reset = useCallback(() => {
    const next = clampToContainer(min);
    setWidth(next);
    persist(next);
  }, [clampToContainer, min]);

  return { panelRef, width, onHandleMouseDown, reset };
}
