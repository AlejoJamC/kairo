import { useSyncExternalStore } from 'react'

// The native build has no DOM types, so the browser API is described here.
type MediaList = {
  matches: boolean
  addEventListener: (type: 'change', listener: () => void) => void
  removeEventListener: (type: 'change', listener: () => void) => void
}
type MatchMedia = (query: string) => MediaList

const none = () => () => {}

/** True while the viewport is at least `width` px wide. `initial` is the answer on the server and where there is no browser. */
export function useMinWidth(width: number, initial = true): boolean {
  const query = `(min-width: ${width}px)`
  const matchMedia = (globalThis as { matchMedia?: MatchMedia }).matchMedia
  return useSyncExternalStore(
    matchMedia
      ? (onChange) => {
          const media = matchMedia(query)
          media.addEventListener('change', onChange)
          return () => media.removeEventListener('change', onChange)
        }
      : none,
    () => (matchMedia ? matchMedia(query).matches : initial),
    () => initial,
  )
}
