import { useEffect, useRef, type ReactNode } from 'react'
import { ensureMotionStyles } from './lib/motion-css'

// How much of the neighbouring tab stays visible past the selected one, so the
// strip reads as scrollable without a scrollbar.
const PEEK = 24

function reveal(strip: HTMLElement, tab: HTMLElement) {
  const left = tab.offsetLeft - (tab.previousElementSibling ? PEEK : 0)
  const right = tab.offsetLeft + tab.offsetWidth + (tab.nextElementSibling ? PEEK : 0)
  if (right > strip.scrollLeft + strip.clientWidth) strip.scrollTo?.({ left: right - strip.clientWidth, behavior: 'smooth' })
  else if (left < strip.scrollLeft) strip.scrollTo?.({ left, behavior: 'smooth' })
}

/** Horizontal strip that keeps the selected tab in view and shows no scrollbar. */
function TabStrip({ children }: { children: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = strip.current
    if (!el) return
    const sync = () => {
      const selected = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (selected) reveal(el, selected)
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(el, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] })
    return () => observer.disconnect()
  }, [])

  ensureMotionStyles()
  return (
    <div ref={strip} className="kairo-ui-tabstrip" style={{ position: 'relative', overflowX: 'auto', minWidth: 0 }}>
      {children}
    </div>
  )
}

export { TabStrip }
