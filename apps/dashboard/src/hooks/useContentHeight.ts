import { useEffect, useRef } from "react";

/** Calls onChange with the natural height of the element now and every time it changes. */
export function useContentHeight<T extends HTMLElement>(onChange: (height: number) => void) {
  const ref = useRef<T>(null);
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => callback.current(Math.ceil(element.getBoundingClientRect().height)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}
