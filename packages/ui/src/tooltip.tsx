import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { styled, Stack, Text } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { px } from './lib/units'

// Short text label for controls without a visible label. Appears after 400ms
// on hover and at once on keyboard focus; esc hides it without moving focus.
// Never holds interactive content. Not shown for disabled triggers.

const HOVER_DELAY_MS = 400
const GAP = 8

const Bubble = styled(Stack, {
  name: 'Tooltip',
  position: 'fixed' as never,
  zIndex: 100,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  maxWidth: 240,
  paddingVertical: 4,
  paddingHorizontal: 8,
  borderRadius: px(tokens['radius.control']),
  backgroundColor: tokens['surface.inverse'],
  boxShadow: tokens['shadow.pop'],
  pointerEvents: 'none',
})

const Label = styled(Text, {
  name: 'TooltipLabel',
  fontSize: 12,
  lineHeight: 17.4,
  color: tokens['text.inverse'],
})

const Shortcut = styled(Text, {
  name: 'TooltipShortcut',
  fontFamily: '$mono',
  fontSize: 11,
  color: tokens['color.inverse-faint'],
})

type Side = 'top' | 'right'

type TooltipProps = {
  label: string
  /** Shortcut key shown after the label, in mono. */
  shortcut?: string
  /** Above the trigger by default; the collapsed sidebar places it to the right. */
  side?: Side
  disabled?: boolean
  /** The trigger: a single element that accepts mouse and focus handlers. */
  children: ReactElement<Record<string, unknown>>
}

function Tooltip({ label, shortcut, side = 'top', disabled, children }: TooltipProps) {
  const id = useId()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setAnchor(null)
  }, [])

  const show = useCallback((element: Element, delay: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAnchor(element.getBoundingClientRect()), delay)
  }, [])

  useEffect(() => {
    if (!anchor) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [anchor, hide])

  useEffect(() => () => clearTimeout(timer.current), [])

  const trigger = children.props
  if (disabled || trigger.disabled === true) return children

  const chain =
    <E,>(own: unknown, next: (event: E) => void) =>
    (event: E) => {
      if (typeof own === 'function') own(event)
      next(event)
    }

  // Near the top edge of the window there is no room above: the label goes below.
  const below = !!anchor && side === 'top' && anchor.top < 40
  const clampedX = anchor ? Math.min(Math.max(anchor.left + anchor.width / 2, 130), window.innerWidth - 130) : 0
  const placement =
    anchor && side === 'top'
      ? below
        ? { top: anchor.bottom + GAP, left: clampedX, transform: 'translateX(-50%)' }
        : { top: anchor.top - GAP, left: clampedX, transform: 'translate(-50%, -100%)' }
      : anchor
        ? { top: anchor.top + anchor.height / 2, left: anchor.right + GAP, transform: 'translateY(-50%)' }
        : null

  return (
    <>
      {cloneElement(children, {
        'aria-describedby': anchor ? id : trigger['aria-describedby'],
        onMouseEnter: chain(trigger.onMouseEnter, (event: MouseEvent) => show(event.currentTarget, HOVER_DELAY_MS)),
        onMouseLeave: chain(trigger.onMouseLeave, hide),
        onFocus: chain(trigger.onFocus, (event: FocusEvent) => show(event.currentTarget, 0)),
        onBlur: chain(trigger.onBlur, hide),
      })}
      {placement &&
        createPortal(
          <Bubble id={id} role="tooltip" style={placement}>
            <Label>{label}</Label>
            {shortcut && <Shortcut>{shortcut}</Shortcut>}
          </Bubble>,
          document.body,
        )}
    </>
  )
}

export { Tooltip }
export type { TooltipProps }
