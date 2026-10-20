import type { ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'

// React Native drawer: a modal with a panel on the right edge.

type DrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  footer?: ReactNode
  closeLabel?: string
  children?: ReactNode
}

function Drawer({ open, onOpenChange, title, footer, closeLabel = 'Close', children }: DrawerProps) {
  return (
    <Modal transparent visible={open} animationType="slide" onRequestClose={() => onOpenChange(false)}>
      <Pressable style={styles.scrim} onPress={() => onOpenChange(false)}>
        <View style={styles.panel} accessibilityViewIsModal onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={() => onOpenChange(false)}>
              <Icon name="x" size={14} color={tokens['text.tertiary']} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'flex-end', backgroundColor: tokens['surface.scrim'] },
  panel: {
    height: '100%',
    width: 344,
    maxWidth: '100%',
    backgroundColor: tokens['surface.panel'],
    borderLeftWidth: 1,
    borderLeftColor: tokens['border.default'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56, paddingHorizontal: 18 },
  title: { fontSize: 16, fontWeight: '600', color: tokens['text.primary'] },
  body: { padding: 18, gap: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 18, borderTopWidth: 1, borderTopColor: tokens['border.default'] },
})

export { Drawer }
export type { DrawerProps }
