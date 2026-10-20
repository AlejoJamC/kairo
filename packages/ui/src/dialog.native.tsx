import type { ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'

// React Native dialog: a modal with a centered panel.

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  footer?: ReactNode
  dirty?: boolean
  closeLabel?: string
  maxWidth?: number
  children?: ReactNode
}

function Dialog({ open, onOpenChange, title, footer, dirty, closeLabel = 'Close', maxWidth = 480, children }: DialogProps) {
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => onOpenChange(false)}>
      <Pressable style={styles.scrim} onPress={() => !dirty && onOpenChange(false)}>
        <View style={[styles.panel, { maxWidth }]} accessibilityViewIsModal onStartShouldSetResponder={() => true}>
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
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: tokens['surface.scrim'] },
  panel: {
    width: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
    backgroundColor: tokens['surface.panel'],
    borderWidth: 1,
    borderColor: tokens['border.default'],
    borderRadius: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20 },
  title: { fontSize: 16, fontWeight: '600', color: tokens['text.primary'] },
  body: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: tokens['surface.sunken'],
    borderTopWidth: 1,
    borderTopColor: tokens['border.default'],
  },
})

export { Dialog }
export type { DialogProps }
