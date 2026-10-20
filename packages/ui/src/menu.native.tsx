import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { tokens } from '@kairo/tokens'

// React Native menu: a list of pressable rows.

type MenuProps = { label: string; style?: ViewStyle; children?: ReactNode }

function Menu({ label, style, children }: MenuProps) {
  return (
    <View accessibilityRole="menu" accessibilityLabel={label} style={[styles.list, style]}>
      {children}
    </View>
  )
}

type MenuItemProps = {
  label: string
  onSelect?: () => void
  icon?: ReactNode
  shortcut?: ReactNode
  current?: boolean
  destructive?: boolean
  disabled?: boolean
  rich?: boolean
}

function MenuItem({ label, onSelect, icon, shortcut, current, destructive, disabled, rich }: MenuItemProps) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ disabled: !!disabled, selected: !!current }}
      disabled={disabled}
      onPress={onSelect}
      style={[styles.item, rich && styles.rich, disabled && styles.disabled]}
    >
      {icon}
      <Text
        style={[
          styles.itemText,
          current && styles.current,
          destructive && { color: tokens['color.bad-ink'] },
        ]}
      >
        {label}
      </Text>
      {shortcut}
    </Pressable>
  )
}

function MenuLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>
}

function MenuSeparator() {
  return <View style={styles.divider} />
}

const styles = StyleSheet.create({
  list: { padding: 4, minWidth: 180 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32, paddingHorizontal: 10, borderRadius: 7 },
  rich: { minHeight: 40 },
  disabled: { opacity: 0.6 },
  itemText: { flex: 1, fontSize: 13, color: tokens['text.secondary'] },
  current: { color: tokens['text.primary'], fontWeight: '500' },
  section: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, fontSize: 10.5, letterSpacing: 0.6, color: tokens['text.tertiary'], textTransform: 'uppercase' },
  divider: { height: 1, marginVertical: 4, backgroundColor: tokens['border.default'] },
})

export { Menu, MenuItem, MenuLabel, MenuSeparator }
export type { MenuProps, MenuItemProps }
