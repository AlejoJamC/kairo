// React Native implementation — resolved by Metro instead of dropdown-menu.tsx.
// A full-featured popover menu on RN requires platform-specific gesture handling.
// This stub exports the same API surface as the web implementation so imports
// compile on RN; consumers should use ActionSheet or a native menu library for
// production use. Renders nothing — prevents import errors in shared code.

import { createContext, useContext, useState, type ReactNode } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, type ViewStyle } from 'react-native'

// ─── Context ─────────────────────────────────────────────────────────────────

type DropdownCtx = { open: boolean; toggle: () => void; close: () => void }
const DropdownContext = createContext<DropdownCtx>({ open: false, toggle: () => {}, close: () => {} })
type RadioCtx = { value?: string; onValueChange?: (v: string) => void }
const RadioGroupContext = createContext<RadioCtx>({})
type SubCtx = { subOpen: boolean; toggleSub: () => void; closeSub: () => void }
const SubContext = createContext<SubCtx>({ subOpen: false, toggleSub: () => {}, closeSub: () => {} })

// ─── Root ─────────────────────────────────────────────────────────────────────

type Props = { children?: ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (o: boolean) => void; modal?: boolean }

function DropdownMenu({ children, open: ctrl, defaultOpen = false, onOpenChange }: Props) {
  const [unc, setUnc] = useState(defaultOpen)
  const isCtrl = ctrl !== undefined
  const open = isCtrl ? (ctrl as boolean) : unc
  const close = () => { if (!isCtrl) setUnc(false); onOpenChange?.(false) }
  const toggle = () => { const n = !open; if (!isCtrl) setUnc(n); onOpenChange?.(n) }
  return <DropdownContext.Provider value={{ open, toggle, close }}><View>{children}</View></DropdownContext.Provider>
}

function DropdownMenuPortal({ children }: { children?: ReactNode }) { return <>{children}</> }

function DropdownMenuTrigger({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const { toggle } = useContext(DropdownContext)
  return <TouchableOpacity onPress={toggle} style={style} activeOpacity={0.7}>{children}</TouchableOpacity>
}

function DropdownMenuContent({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const { open, close } = useContext(DropdownContext)
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={close} />
      <View style={[s.content, style]}>{children}</View>
    </Modal>
  )
}

function DropdownMenuGroup({ children }: { children?: ReactNode }) { return <View>{children}</View> }

function DropdownMenuItem({ children, onSelect, style }: { children?: ReactNode; onSelect?: () => void; style?: ViewStyle }) {
  const { close } = useContext(DropdownContext)
  return <TouchableOpacity onPress={() => { onSelect?.(); close() }} style={[s.item, style]} activeOpacity={0.7}><View style={s.row}>{children}</View></TouchableOpacity>
}

function DropdownMenuCheckboxItem({ children, checked, onCheckedChange, style }: { children?: ReactNode; checked?: boolean; onCheckedChange?: (c: boolean) => void; style?: ViewStyle }) {
  return <TouchableOpacity onPress={() => onCheckedChange?.(!checked)} style={[s.item, style]} activeOpacity={0.7}><View style={s.row}><Text style={s.checkmark}>{checked ? '✓' : '  '}</Text><View style={{ flex: 1 }}>{children}</View></View></TouchableOpacity>
}

function DropdownMenuRadioGroup({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children?: ReactNode }) {
  return <RadioGroupContext.Provider value={{ value, onValueChange }}><View>{children}</View></RadioGroupContext.Provider>
}

function DropdownMenuRadioItem({ value, children, style }: { value: string; children?: ReactNode; style?: ViewStyle }) {
  const { value: gv, onValueChange } = useContext(RadioGroupContext)
  const checked = gv === value
  return <TouchableOpacity onPress={() => onValueChange?.(value)} style={[s.item, style]} activeOpacity={0.7}><View style={s.row}>{checked ? <View style={s.radio} /> : <View style={s.radioEmpty} />}<View style={{ flex: 1 }}>{children}</View></View></TouchableOpacity>
}

function DropdownMenuLabel({ children, style }: { children?: ReactNode; style?: ViewStyle }) { return <View style={[s.label, style]}><Text style={s.labelText}>{children}</Text></View> }
function DropdownMenuSeparator({ style }: { style?: ViewStyle }) { return <View style={[s.separator, style]} /> }
function DropdownMenuShortcut({ children }: { children?: ReactNode }) { return <Text style={s.shortcut}>{children}</Text> }

function DropdownMenuSub({ children }: { children?: ReactNode }) {
  const [subOpen, setSubOpen] = useState(false)
  return <SubContext.Provider value={{ subOpen, toggleSub: () => setSubOpen(v => !v), closeSub: () => setSubOpen(false) }}><View>{children}</View></SubContext.Provider>
}

function DropdownMenuSubTrigger({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const { toggleSub } = useContext(SubContext)
  return <TouchableOpacity onPress={toggleSub} style={[s.item, style]} activeOpacity={0.7}><View style={s.row}>{children}<Text style={s.chevron}>›</Text></View></TouchableOpacity>
}

function DropdownMenuSubContent({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const { subOpen } = useContext(SubContext)
  if (!subOpen) return null
  return <View style={[s.content, style]}>{children}</View>
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  content: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e4e4e7', padding: 4, minWidth: 128, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  item: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { paddingHorizontal: 8, paddingVertical: 6 },
  labelText: { fontSize: 12, fontWeight: '500', color: '#71717a' },
  separator: { height: 1, backgroundColor: '#e4e4e7', marginHorizontal: -4, marginVertical: 4 },
  shortcut: { marginLeft: 'auto', fontSize: 11, color: '#a1a1aa', letterSpacing: 2 },
  checkmark: { width: 16, fontSize: 12, color: '#09090b' },
  radio: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#09090b', margin: 4 },
  radioEmpty: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#09090b', margin: 4 },
  chevron: { marginLeft: 'auto', color: '#71717a', fontSize: 14 },
})

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
