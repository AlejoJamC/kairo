import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { styled, Stack, type GetProps } from '@tamagui/core'

// ─── Context ─────────────────────────────────────────────────────────────────

type CollapsibleContextValue = {
  open: boolean
  disabled: boolean
  toggle: () => void
}

const CollapsibleContext = createContext<CollapsibleContextValue>({
  open: false,
  disabled: false,
  toggle: () => {},
})

// ─── Collapsible Root ────────────────────────────────────────────────────────
// Supports both controlled (open + onOpenChange) and uncontrolled (defaultOpen).

type CollapsibleProps = {
  /** Controlled open state */
  open?: boolean
  /** Initial open state when uncontrolled */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  children?: ReactNode
  /** Pass-through style props to the root Stack */
  style?: object
}

function Collapsible({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  children,
  ...props
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? (controlledOpen as boolean) : uncontrolledOpen

  const toggle = useCallback(() => {
    if (disabled) return
    const next = !open
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }, [open, isControlled, disabled, onOpenChange])

  return (
    <CollapsibleContext.Provider value={{ open, disabled, toggle }}>
      <Stack {...(props as GetProps<typeof Stack>)}>{children}</Stack>
    </CollapsibleContext.Provider>
  )
}

// ─── CollapsibleTrigger ───────────────────────────────────────────────────────
// Renders as <button> on web; pressable Stack on RN.

const TriggerFrame = styled(Stack, {
  name: 'CollapsibleTrigger',
  tag: 'button',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: 0,
  outlineWidth: 0,
  userSelect: 'none',
  flexDirection: 'row',
  alignItems: 'center',
})

type CollapsibleTriggerProps = GetProps<typeof TriggerFrame>

function CollapsibleTrigger({ children, ...props }: CollapsibleTriggerProps) {
  const { toggle, disabled, open } = useContext(CollapsibleContext)
  return (
    <TriggerFrame
      onPress={toggle}
      aria-expanded={open}
      aria-disabled={disabled}
      disabled={disabled as never}
      {...props}
    >
      {children}
    </TriggerFrame>
  )
}

// ─── CollapsibleContent ───────────────────────────────────────────────────────
// Simple show/hide — no animation at this layer. Apps that need animated
// open/close can wrap children with Animated.View or Tamagui animations.

type CollapsibleContentProps = GetProps<typeof Stack>

function CollapsibleContent({ children, ...props }: CollapsibleContentProps) {
  const { open } = useContext(CollapsibleContext)
  if (!open) return null
  return <Stack {...props}>{children}</Stack>
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
export type { CollapsibleProps, CollapsibleTriggerProps, CollapsibleContentProps }
