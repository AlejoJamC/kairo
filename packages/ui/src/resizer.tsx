import { useRef } from 'react'
import { styled, Stack } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { domProps } from './lib/overlay'

// Drag handle between two panes. A vertical handle resizes horizontally. It is
// a focusable separator: arrow keys step the size (shift = larger step),
// home/end jump to the limits and a double press resets.

const Handle = styled(Stack, {
  name: 'Resizer',
  width: 6,
  marginHorizontal: -3,
  alignSelf: 'stretch',
  cursor: 'col-resize',
  zIndex: 5,
  alignItems: 'center',
  hoverStyle: { backgroundColor: tokens['accent.soft'] },
  focusStyle: { backgroundColor: tokens['accent.line'], outlineWidth: 0 },
})

type ResizerProps = {
  /** Accessible name, for example "Resize the context panel". */
  label: string
  /** Size of the pane being resized, in pixels. */
  value: number
  min: number
  max: number
  onValueChange: (value: number) => void
  /** Called once when a drag or key press settles, to persist the size. */
  onCommit?: (value: number) => void
  /** Called on double press. */
  onReset?: () => void
  /** The pane grows when the pointer moves left (a pane pinned to the right edge). */
  invert?: boolean
  step?: number
}

function Resizer({ label, value, min, max, onValueChange, onCommit, onReset, invert, step = 16 }: ResizerProps) {
  const drag = useRef<{ x: number; start: number } | null>(null)
  const latest = useRef(value)
  latest.current = value
  const clamp = (next: number) => Math.min(Math.max(next, min), max)
  const direction = invert ? -1 : 1

  const set = (next: number) => {
    const clamped = clamp(next)
    latest.current = clamped
    onValueChange(clamped)
  }

  const onPointerDown = (event: { clientX: number; currentTarget: Element; pointerId: number; preventDefault: () => void }) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { x: event.clientX, start: latest.current }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const onPointerMove = (event: { clientX: number }) => {
    if (!drag.current) return
    set(drag.current.start + (event.clientX - drag.current.x) * direction)
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    onCommit?.(latest.current)
  }
  const onKeyDown = (event: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
    const size = event.shiftKey ? step * 4 : step
    const move = (delta: number) => {
      event.preventDefault()
      set(latest.current + delta)
      onCommit?.(latest.current)
    }
    if (event.key === 'ArrowLeft') move(-size * direction)
    else if (event.key === 'ArrowRight') move(size * direction)
    else if (event.key === 'Home') move(min - latest.current)
    else if (event.key === 'End') move(max - latest.current)
  }

  return (
    <Handle
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      {...domProps({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown, onDoubleClick: onReset })}
    />
  )
}

export { Resizer }
export type { ResizerProps }
