// React Native implementation — resolved by Metro instead of sheet.tsx.
// TypeScript checks are done on the web file only (see tsconfig.json exclude).
// On RN, only bottom sheet is supported natively; top/left/right are mapped to bottom.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { Modal, View, TouchableOpacity, Text, StyleSheet, type ViewStyle } from 'react-native'

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

  return (
    <SheetContext.Provider value={{ open, toggle, close }}>
      {children}
    </SheetContext.Provider>
  )
}

// ─── SheetTrigger ────────────────────────────────────────────────────────────

type SheetTriggerProps = { children?: ReactNode; style?: ViewStyle }

function SheetTrigger({ children, style }: SheetTriggerProps) {
  const { toggle } = useContext(SheetContext)
  return (
    <TouchableOpacity onPress={toggle} style={style} activeOpacity={0.7}>
      {children}
    </TouchableOpacity>
  )
}

// ─── SheetClose ───────────────────────────────────────────────────────────────

type SheetCloseProps = { children?: ReactNode; style?: ViewStyle }

function SheetClose({ children, style }: SheetCloseProps) {
  const { close } = useContext(SheetContext)
  return (
    <TouchableOpacity onPress={close} style={style} activeOpacity={0.7}>
      {children}
    </TouchableOpacity>
  )
}

// ─── SheetContent ─────────────────────────────────────────────────────────────
// On RN all sides are rendered as a bottom sheet (native Modal + slide-up).
// top/left/right are accepted for API compat but behave like bottom.

type SheetContentProps = {
  side?: 'top' | 'right' | 'bottom' | 'left'
  showCloseButton?: boolean
  children?: ReactNode
  style?: ViewStyle
}

function SheetContent({ children, showCloseButton = true, style }: SheetContentProps) {
  const { open, close } = useContext(SheetContext)
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={close} />
      <View style={[styles.content, style]}>
        {showCloseButton && (
          <TouchableOpacity style={styles.closeButton} onPress={close}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        )}
        {children}
      </View>
    </Modal>
  )
}

// ─── SheetHeader / Footer / Title / Description ───────────────────────────────

function SheetHeader({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.header, style]}>{children}</View>
}

function SheetFooter({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.footer, style]}>{children}</View>
}

function SheetTitle({ children }: { children?: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

function SheetDescription({ children }: { children?: ReactNode }) {
  return <Text style={styles.description}>{children}</Text>
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    minHeight: 200,
    borderTopWidth: 1,
    borderColor: '#e4e4e7',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  closeText: {
    fontSize: 16,
    color: '#52525b',
  },
  header: {
    flexDirection: 'column',
    gap: 6,
    padding: 16,
  },
  footer: {
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    marginTop: 'auto',
  },
  title: {
    color: '#09090b',
    fontWeight: '600',
    fontSize: 16,
  },
  description: {
    color: '#52525b',
    fontSize: 14,
  },
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
