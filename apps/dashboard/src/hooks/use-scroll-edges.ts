import { useCallback, useEffect, useState } from "react";

// Tracks whether a scrollable area overflows and whether it is at its end, for the jump
// button. The returned `attach` is a callback ref, so the measuring starts when the element
// mounts, even if it appears after the first render.

/** Pixels from the end that still count as being at the end. */
const END_TOLERANCE = 24;
/** Overflow below this is not worth a button. */
const OVERFLOW_MIN = 8;

export function useScrollEdges() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [state, setState] = useState({ scrollable: false, atEnd: true });

  useEffect(() => {
    if (!element) return;
    const measure = () => {
      const overflow = element.scrollHeight - element.clientHeight;
      const next = { scrollable: overflow > OVERFLOW_MIN, atEnd: overflow - element.scrollTop <= END_TOLERANCE };
      setState((previous) => (previous.scrollable === next.scrollable && previous.atEnd === next.atEnd ? previous : next));
    };
    element.addEventListener("scroll", measure, { passive: true });
    // Fires once on observe, and again whenever the area or its content changes size.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [element]);

  const jump = useCallback(() => {
    if (!element) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const top = state.atEnd ? 0 : element.scrollHeight;
    element.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  }, [element, state.atEnd]);

  return { attach: setElement, scrollable: state.scrollable, direction: state.atEnd ? ("up" as const) : ("down" as const), jump };
}
