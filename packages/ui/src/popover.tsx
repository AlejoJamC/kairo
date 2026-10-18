import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { styled, Stack, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { px } from './lib/units'
import { useAnchoredPosition, useEscape, useFocusScope, useOutsidePress, type Align, type Side } from './lib/overlay'

// Floating surface for menus and small dialogs, anchored to its trigger.
// Closes with esc and on a press outside; focus moves in on open and returns
// to the trigger on close.

type PopoverContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  anchor: Element | null
  setAnchor: (element: Element | null) => void
  contentId: string
}

const PopoverContext = createContext<PopoverContextValue | null>(null)

function usePopover(): PopoverContextValue {
  const context = useContext(PopoverContext)
  if (!context) throw new Error('Popover parts must be rendered inside <Popover>')
  return context
}

type PopoverProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

function Popover({ open: controlled, defaultOpen = false, onOpenChange, children }: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const [anchor, setAnchor] = useState<Element | null>(null)
  const contentId = useId()
  const isControlled = controlled !== undefined
  const open = isControlled ? controlled : uncontrolled

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  const value = useMemo(() => ({ open, setOpen, anchor, setAnchor, contentId }), [open, setOpen, anchor, contentId])
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
}

type TriggerProps = { children: ReactElement<Record<string, unknown>> }

/** Makes its single child the anchor and the toggle of the popover. */
function PopoverTrigger({ children }: TriggerProps) {
  const { open, setOpen, setAnchor, contentId } = usePopover()
  const own = children.props.ref as Ref<Element> | undefined
  const onClick = children.props.onClick as ((event: unknown) => void) | undefined
  return cloneElement(children, {
    ref: (element: Element | null) => {
      setAnchor(element)
      if (typeof own === 'function') own(element)
      else if (own && 'current' in own) (own as { current: Element | null }).current = element
    },
    'aria-haspopup': 'true',
    'aria-expanded': open,
    'aria-controls': open ? contentId : undefined,
    onClick: (event: unknown) => {
      onClick?.(event)
      setOpen(!open)
    },
  })
}

const Surface = styled(Stack, {
  name: 'Popover',
  position: 'fixed' as never,
  zIndex: 90,
  backgroundColor: tokens['surface.panel'],
  borderWidth: 1,
  borderColor: tokens['border.default'],
  borderRadius: px(tokens['radius.card']),
  boxShadow: tokens['shadow.pop'],
  outlineWidth: 0,
})

type PopoverContentProps = Omit<GetProps<typeof Surface>, 'role'> & {
  role?: 'menu' | 'dialog'
  /** Accessible name of the surface. */
  label: string
  side?: Side
  align?: Align
}

function PopoverContent({ role = 'dialog', label, side = 'bottom', align = 'start', children, ...props }: PopoverContentProps) {
  const { open } = usePopover()
  if (!open) return null
  return (
    <FloatingContent role={role} label={label} side={side} align={align} {...props}>
      {children}
    </FloatingContent>
  )
}

function FloatingContent({ role, label, side, align, children, ...props }: PopoverContentProps & { side: Side; align: Align }) {
  const { anchor, setOpen, contentId } = usePopover()
  const ref = useRef<HTMLElement | null>(null)
  const position = useAnchoredPosition(anchor, side, align)

  useEscape(() => setOpen(false))
  useOutsidePress([ref, anchor], () => setOpen(false))
  useFocusScope(ref, false)

  // Hidden until the first measurement lands, which happens before paint.
  return createPortal(
    <Surface
      id={contentId}
      ref={ref as never}
      // A menu popover is only the floating frame: the <Menu> inside carries the role and name.
      role={role === 'menu' ? undefined : role}
      aria-label={role === 'menu' ? undefined : label}
      tabIndex={-1}
      style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
      {...props}
    >
      {children}
    </Surface>,
    document.body,
  )
}

export { Popover, PopoverTrigger, PopoverContent }
export type { PopoverProps, PopoverContentProps }
