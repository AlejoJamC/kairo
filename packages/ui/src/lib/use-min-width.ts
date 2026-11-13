import { useSyncExternalStore } from 'react'

const none = () => () => {}

/** True while the viewport is at least `width` px wide. `initial` is the answer on the server and where there is no window. */
export function useMinWidth(width: number, initial = true): boolean {
  const query = `(min-width: ${width}px)`
  const hasMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  return useSyncExternalStore(
    hasMedia
      ? (onChange) => {
          const media = window.matchMedia(query)
          media.addEventListener('change', onChange)
          return () => media.removeEventListener('change', onChange)
        }
      : none,
    () => (hasMedia ? window.matchMedia(query).matches : initial),
    () => initial,
  )
}
