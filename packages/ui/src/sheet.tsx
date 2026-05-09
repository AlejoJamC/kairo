// Web implementation — uses createPortal for the overlay layer.
// Metro resolves sheet.native.tsx for React Native automatically.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'

// ─── Context ─────────────────────────────────────────────────────────────────

type SheetContextValue = {
  open: boolean
  toggle: () => void
  close: () => void
}

const SheetContext = createContext<SheetContextValue>({
  open: false,
  toggle: () => {},
  close: () => {},
})

// ─── Sheet Root ───────────────────────────────────────────────────────────────

type SheetProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

function Sheet({ open: controlledOpen, defaultOpen = false, onOpenChange, children }: SheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? (controlledOpen as boolean) : uncontrolledOpen

  const close = useCallback(() => {
    if (!isControlled) setUncontrolledOpen(false)
    onOpenChange?.(false)
  }, [isControlled, onOpenChange])

  const toggle = useCallback(() => {
    const next = !open
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }, [open, isControlled, onOpenChange])

  // Escape key closes sheet
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  return <SheetContext.Provider value={{ open, toggle, close }}>{children}</SheetContext.Provider>
}

// ─── SheetTrigger ────────────────────────────────────────────────────────────

const TriggerFrame = styled(Stack, {
  name: 'SheetTrigger',
  tag: 'button',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: 0,
  outlineWidth: 0,
})

type SheetTriggerProps = GetProps<typeof TriggerFrame>

function SheetTrigger({ children, ...props }: SheetTriggerProps) {
  const { open, toggle } = useContext(SheetContext)
  return (
    <TriggerFrame onPress={toggle} aria-expanded={open} {...props}>
      {children}
    </TriggerFrame>
  )
}

// ─── SheetClose ───────────────────────────────────────────────────────────────

const CloseFrame = styled(Stack, {
  name: 'SheetClose',
  tag: 'button',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: 0,
  outlineWidth: 0,
})

type SheetCloseProps = GetProps<typeof CloseFrame>

function SheetClose({ children, ...props }: SheetCloseProps) {
  const { close } = useContext(SheetContext)
  return <CloseFrame onPress={close} {...props}>{children}</CloseFrame>
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

const OverlayFrame = styled(Stack, {
  name: 'SheetOverlay',
  position: 'fixed' as never,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 49,
  backgroundColor: 'rgba(0,0,0,0.5)',
})

// ─── SheetContent ────────────────────────────────────────────────────────────

const sideStyles = {
  right:  { top: 0, right: 0, bottom: 0, width: '75%', maxWidth: 384, borderLeftWidth: 1 },
  left:   { top: 0, left: 0, bottom: 0, width: '75%', maxWidth: 384, borderRightWidth: 1 },
  top:    { top: 0, left: 0, right: 0, borderBottomWidth: 1 },
  bottom: { bottom: 0, left: 0, right: 0, borderTopWidth: 1 },
} as const

const ContentFrame = styled(Stack, {
  name: 'SheetContent',
  position: 'fixed' as never,
  zIndex: 50,
  backgroundColor: '$background',
  borderColor: '$borderColor',
  flexDirection: 'column',
  gap: '$3',
  shadowColor: '$black',
  shadowOpacity: 0.15,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 0 },
})

type SheetContentProps = GetProps<typeof ContentFrame> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  showCloseButton?: boolean
  children?: ReactNode
}

function SheetContent({
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  const { open, close } = useContext(SheetContext)
  if (!open) return null

  const panel = (
    <>
      <OverlayFrame onPress={close} />
      <ContentFrame {...sideStyles[side]} {...props}>
        {children}
        {showCloseButton && (
          <Stack
            tag="button"
            position="absolute"
            top={16}
            right={16}
            cursor="pointer"
            backgroundColor="transparent"
            borderWidth={0}
            padding={4}
            onPress={close}
            aria-label="Close"
          >
            <Text fontSize={16} lineHeight={16} color="$colorSecondary">✕</Text>
          </Stack>
        )}
      </ContentFrame>
    </>
  )

  return createPortal(panel, document.body)
}

// ─── SheetHeader / Footer / Title / Description ───────────────────────────────

const SheetHeader = styled(Stack, {
  name: 'SheetHeader',
  flexDirection: 'column',
  gap: 6,
  padding: '$4',
})

const SheetFooter = styled(Stack, {
  name: 'SheetFooter',
  flexDirection: 'column',
  gap: '$2',
  padding: '$4',
  marginTop: 'auto',
})

const SheetTitle = styled(Text, {
  name: 'SheetTitle',
  color: '$color',
  fontWeight: '600',
  fontSize: 16,
})

const SheetDescription = styled(Text, {
  name: 'SheetDescription',
  color: '$colorSecondary',
  fontSize: 14,
})

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
export type { SheetProps, SheetTriggerProps, SheetCloseProps, SheetContentProps }
