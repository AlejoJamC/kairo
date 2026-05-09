// Web implementation — uses createPortal for the floating menu layer.
// Metro resolves dropdown-menu.native.tsx for React Native automatically.
// All 14 original exports are preserved for API compatibility.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'

// ─── Context ─────────────────────────────────────────────────────────────────

type DropdownContextValue = {
  open: boolean
  toggle: () => void
  close: () => void
  triggerRef: React.RefObject<HTMLElement | null>
}

const DropdownContext = createContext<DropdownContextValue>({
  open: false,
  toggle: () => {},
  close: () => {},
  triggerRef: { current: null },
})

// Sub-menu context (nested)
type SubContextValue = { subOpen: boolean; toggleSub: () => void; closeSub: () => void }
const SubContext = createContext<SubContextValue>({
  subOpen: false, toggleSub: () => {}, closeSub: () => {},
})

// RadioGroup context
type RadioGroupContextValue = { value?: string; onValueChange?: (v: string) => void }
const RadioGroupContext = createContext<RadioGroupContextValue>({})

// ─── DropdownMenu Root ────────────────────────────────────────────────────────

type DropdownMenuProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
  modal?: boolean
}

function DropdownMenu({ open: ctrl, defaultOpen = false, onOpenChange, children }: DropdownMenuProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const isControlled = ctrl !== undefined
  const open = isControlled ? (ctrl as boolean) : uncontrolled
  const triggerRef = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    if (!isControlled) setUncontrolled(false)
    onOpenChange?.(false)
  }, [isControlled, onOpenChange])

  const toggle = useCallback(() => {
    const next = !open
    if (!isControlled) setUncontrolled(next)
    onOpenChange?.(next)
  }, [open, isControlled, onOpenChange])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onClickOutside = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [open, close])

  return (
    <DropdownContext.Provider value={{ open, toggle, close, triggerRef }}>
      <Stack position="relative" display="inline-flex">{children}</Stack>
    </DropdownContext.Provider>
  )
}

// ─── DropdownMenuPortal ───────────────────────────────────────────────────────
// No-op wrapper kept for API compat — content already portals via createPortal.

function DropdownMenuPortal({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

// ─── DropdownMenuTrigger ──────────────────────────────────────────────────────

const TriggerFrame = styled(Stack, {
  name: 'DropdownMenuTrigger',
  tag: 'button',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: 0,
  outlineWidth: 0,
  display: 'inline-flex',
  alignItems: 'center',
})

type DropdownMenuTriggerProps = GetProps<typeof TriggerFrame>

function DropdownMenuTrigger({ children, ...props }: DropdownMenuTriggerProps) {
  const { toggle, open, triggerRef } = useContext(DropdownContext)
  return (
    <TriggerFrame
      onPress={toggle}
      aria-expanded={open}
      aria-haspopup="menu"
      ref={triggerRef as never}
      {...props}
    >
      {children}
    </TriggerFrame>
  )
}

// ─── DropdownMenuContent ──────────────────────────────────────────────────────

const ContentFrame = styled(Stack, {
  name: 'DropdownMenuContent',
  position: 'absolute' as never,
  top: '100%',
  left: 0,
  zIndex: 50,
  minWidth: 128,
  backgroundColor: '$background',
  borderWidth: 1,
  borderColor: '$borderColor',
  borderRadius: '$inner',
  padding: 4,
  shadowColor: '$black',
  shadowOpacity: 0.1,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  overflow: 'hidden',
})

type DropdownMenuContentProps = GetProps<typeof ContentFrame> & { sideOffset?: number }

function DropdownMenuContent({ children, sideOffset: _sideOffset, ...props }: DropdownMenuContentProps) {
  const { open } = useContext(DropdownContext)
  if (!open) return null
  return createPortal(
    <ContentFrame {...props}>{children}</ContentFrame>,
    document.body
  )
}

// ─── DropdownMenuGroup ────────────────────────────────────────────────────────

function DropdownMenuGroup({ children }: { children?: ReactNode }) {
  return <Stack flexDirection="column">{children}</Stack>
}

// ─── DropdownMenuItem ─────────────────────────────────────────────────────────

const ItemFrame = styled(Stack, {
  name: 'DropdownMenuItem',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  paddingHorizontal: 8,
  paddingVertical: 6,
  borderRadius: '$1',
  cursor: 'pointer',
  userSelect: 'none',

  hoverStyle: { backgroundColor: '$backgroundHover' },
  focusStyle: { backgroundColor: '$backgroundHover', outlineWidth: 0 },

  variants: {
    inset: { true: { paddingLeft: 32 } },
    variant: {
      default: { color: '$color' },
      destructive: { color: '$danger', hoverStyle: { backgroundColor: '$backgroundHover' } },
    },
    disabled: { true: { opacity: 0.5, pointerEvents: 'none' } },
  } as const,

  defaultVariants: { variant: 'default', inset: false, disabled: false },
})

type DropdownMenuItemProps = GetProps<typeof ItemFrame> & {
  inset?: boolean
  variant?: 'default' | 'destructive'
  onSelect?: () => void
}

function DropdownMenuItem({ onSelect, children, ...props }: DropdownMenuItemProps) {
  const { close } = useContext(DropdownContext)
  return (
    <ItemFrame
      role="menuitem"
      onPress={() => { onSelect?.(); close() }}
      {...props}
    >
      {children}
    </ItemFrame>
  )
}

// ─── DropdownMenuCheckboxItem ─────────────────────────────────────────────────

type DropdownMenuCheckboxItemProps = GetProps<typeof ItemFrame> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  children?: ReactNode
}

function DropdownMenuCheckboxItem({ checked, onCheckedChange, children, ...props }: DropdownMenuCheckboxItemProps) {
  return (
    <ItemFrame
      aria-checked={checked}
      paddingLeft={32}
      onPress={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <Stack position="absolute" left={8} width={14} height={14} alignItems="center" justifyContent="center">
        {checked && <Text fontSize={12} color="$color">✓</Text>}
      </Stack>
      {children}
    </ItemFrame>
  )
}

// ─── DropdownMenuRadioGroup ───────────────────────────────────────────────────

type DropdownMenuRadioGroupProps = {
  value?: string
  onValueChange?: (value: string) => void
  children?: ReactNode
}

function DropdownMenuRadioGroup({ value, onValueChange, children }: DropdownMenuRadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <Stack flexDirection="column" role="group">{children}</Stack>
    </RadioGroupContext.Provider>
  )
}

// ─── DropdownMenuRadioItem ────────────────────────────────────────────────────

type DropdownMenuRadioItemProps = GetProps<typeof ItemFrame> & { value: string; children?: ReactNode }

function DropdownMenuRadioItem({ value, children, ...props }: DropdownMenuRadioItemProps) {
  const { value: groupValue, onValueChange } = useContext(RadioGroupContext)
  const checked = groupValue === value
  return (
    <ItemFrame
      aria-checked={checked}
      paddingLeft={32}
      onPress={() => onValueChange?.(value)}
      {...props}
    >
      <Stack position="absolute" left={8} width={14} height={14} alignItems="center" justifyContent="center">
        {checked && <Stack width={8} height={8} borderRadius={9999} backgroundColor="$color" />}
      </Stack>
      {children}
    </ItemFrame>
  )
}

// ─── DropdownMenuLabel ────────────────────────────────────────────────────────

const LabelFrame = styled(Text, {
  name: 'DropdownMenuLabel',
  paddingHorizontal: 8,
  paddingVertical: 6,
  fontSize: 12,
  fontWeight: '500',
  color: '$colorSecondary',
  variants: { inset: { true: { paddingLeft: 32 } } } as const,
  defaultVariants: { inset: false },
})

type DropdownMenuLabelProps = GetProps<typeof LabelFrame> & { inset?: boolean }
function DropdownMenuLabel(props: DropdownMenuLabelProps) { return <LabelFrame {...props} /> }

// ─── DropdownMenuSeparator ────────────────────────────────────────────────────

const SeparatorFrame = styled(Stack, {
  name: 'DropdownMenuSeparator',
  height: 1,
  backgroundColor: '$borderColor',
  marginHorizontal: -4,
  marginVertical: 4,
})

function DropdownMenuSeparator(props: GetProps<typeof SeparatorFrame>) {
  return <SeparatorFrame role="separator" {...props} />
}

// ─── DropdownMenuShortcut ─────────────────────────────────────────────────────

const ShortcutFrame = styled(Text, {
  name: 'DropdownMenuShortcut',
  marginLeft: 'auto',
  fontSize: 11,
  color: '$colorTertiary',
  letterSpacing: 2,
})

function DropdownMenuShortcut(props: GetProps<typeof ShortcutFrame>) { return <ShortcutFrame {...props} /> }

// ─── DropdownMenuSub ──────────────────────────────────────────────────────────

function DropdownMenuSub({ children }: { children?: ReactNode }) {
  const [subOpen, setSubOpen] = useState(false)
  const toggleSub = () => setSubOpen(v => !v)
  const closeSub = () => setSubOpen(false)
  return <SubContext.Provider value={{ subOpen, toggleSub, closeSub }}>{children}</SubContext.Provider>
}

// ─── DropdownMenuSubTrigger ───────────────────────────────────────────────────

type DropdownMenuSubTriggerProps = GetProps<typeof ItemFrame> & { inset?: boolean; children?: ReactNode }

function DropdownMenuSubTrigger({ children, inset, ...props }: DropdownMenuSubTriggerProps) {
  const { toggleSub, subOpen } = useContext(SubContext)
  return (
    <ItemFrame inset={inset} onPress={toggleSub} aria-expanded={subOpen} {...props}>
      {children}
      <Stack marginLeft="auto"><Text fontSize={12} color="$colorSecondary">›</Text></Stack>
    </ItemFrame>
  )
}

// ─── DropdownMenuSubContent ───────────────────────────────────────────────────

type DropdownMenuSubContentProps = GetProps<typeof ContentFrame>

function DropdownMenuSubContent({ children, ...props }: DropdownMenuSubContentProps) {
  const { subOpen } = useContext(SubContext)
  if (!subOpen) return null
  return (
    <ContentFrame
      position="absolute"
      top={0}
      left="100%"
      {...props}
    >
      {children}
    </ContentFrame>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
