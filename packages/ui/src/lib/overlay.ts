import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

// Behaviour shared by the floating surfaces (popover, dialog, drawer). Web only.

// ─── esc: only the top-most open layer reacts ────────────────────────────────

const layers: Array<{ close: () => void }> = []
let listening = false

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  layers[layers.length - 1]?.close()
}

/** Calls `onEscape` for the top-most layer only, so esc closes one surface at a time. */
export function useEscape(onEscape: () => void): void {
  const latest = useRef(onEscape)
  latest.current = onEscape
  useEffect(() => {
    const layer = { close: () => latest.current() }
    layers.push(layer)
    if (!listening) {
      document.addEventListener('keydown', onKeyDown)
      listening = true
    }
    return () => {
      layers.splice(layers.indexOf(layer), 1)
      if (layers.length === 0) {
        document.removeEventListener('keydown', onKeyDown)
        listening = false
      }
    }
  }, [])
}

// ─── outside press ───────────────────────────────────────────────────────────

export function useOutsidePress(
  refs: ReadonlyArray<RefObject<Element | null> | Element | null>,
  onOutside: () => void,
): void {
  const latest = useRef({ refs, onOutside })
  latest.current = { refs, onOutside }
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      const inside = latest.current.refs.some((entry) => {
        const element = entry && 'current' in entry ? entry.current : entry
        return element?.contains(target)
      })
      if (!inside) latest.current.onOutside()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])
}

// ─── focus: move in on open, restore on close, optionally trap Tab ───────────

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusScope(ref: RefObject<HTMLElement | null>, trap: boolean): void {
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const previous = document.activeElement as HTMLElement | null
    const items = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    // Land on the first control of the content, not on the close button.
    const first = items().find((element) => !element.hasAttribute('data-kairo-close')) ?? node
    first.focus()

    const onTab = (event: KeyboardEvent) => {
      if (!trap || event.key !== 'Tab') return
      const list = items()
      if (list.length === 0) {
        event.preventDefault()
        node.focus()
        return
      }
      const head = list[0]!
      const tail = list[list.length - 1]!
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }
    node.addEventListener('keydown', onTab)
    return () => {
      node.removeEventListener('keydown', onTab)
      previous?.focus?.()
    }
  }, [ref, trap])
}

// ─── anchored position ───────────────────────────────────────────────────────

export type Side = 'bottom' | 'top'
export type Align = 'start' | 'end'

const OFFSET = 6

/** Fixed-position style that follows the anchor on scroll and resize. */
export function useAnchoredPosition(anchor: Element | null, side: Side, align: Align) {
  const [style, setStyle] = useState<Record<string, number | undefined> | null>(null)
  useLayoutEffect(() => {
    if (!anchor) return
    const update = () => {
      const rect = anchor.getBoundingClientRect()
      setStyle({
        top: side === 'bottom' ? rect.bottom + OFFSET : undefined,
        bottom: side === 'top' ? window.innerHeight - rect.top + OFFSET : undefined,
        left: align === 'start' ? rect.left : undefined,
        right: align === 'end' ? window.innerWidth - rect.right : undefined,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, side, align])
  return style
}

export { domProps } from './dom-props'
