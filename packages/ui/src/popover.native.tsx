import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { tokens } from '@kairo/tokens'

// React Native popover: a transparent modal over the screen. There is no
// anchor measurement on native, so the surface sits near the top.

type PopoverContextValue = { open: boolean; setOpen: (open: boolean) => void }
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
  const isControlled = controlled !== undefined
  const open = isControlled ? controlled : uncontrolled
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )
  const value = useMemo(() => ({ open, setOpen }), [open, setOpen])
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
}

function PopoverTrigger({ children }: { children: ReactElement<Record<string, unknown>> }) {
  const { open, setOpen } = usePopover()
  const onPress = children.props.onPress as (() => void) | undefined
  return cloneElement(children, {
    accessibilityState: { expanded: open },
    onPress: () => {
      onPress?.()
      setOpen(!open)
    },
  })
}

type PopoverContentProps = {
  role?: 'menu' | 'dialog'
  label: string
  side?: 'bottom' | 'top'
  align?: 'start' | 'end'
  style?: ViewStyle
  children?: ReactNode
}

function PopoverContent({ label, style, children }: PopoverContentProps) {
  const { open, setOpen } = usePopover()
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel={label}>
        <View style={[styles.surface, style]} onStartShouldSetResponder={() => true}>
          {children}
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: tokens['surface.scrim'], paddingTop: 96, paddingHorizontal: 16 },
  surface: {
    alignSelf: 'center',
    backgroundColor: tokens['surface.panel'],
    borderWidth: 1,
    borderColor: tokens['border.default'],
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
})

export { Popover, PopoverTrigger, PopoverContent }
export type { PopoverProps, PopoverContentProps }
