import { Modal, ScrollView, TextInput } from 'react-native'
import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'
import { Skeleton, Spinner } from './loading'
import { px } from './lib/units'

// React Native command palette: a modal with a search field and sections.

type PaletteItem = { id: string; label: string; icon?: IconName; iconColor?: string; shortcut?: readonly string[]; meta?: string; code?: string; where?: string; disabled?: boolean; note?: string; quiet?: boolean }

type PaletteSection = {
  id: string
  title: string
  items: readonly PaletteItem[]
  dense?: boolean
  loading?: boolean
  error?: { message: string; retryLabel: string; onRetry: () => void }
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  query: string
  onQueryChange: (query: string) => void
  sections: readonly PaletteSection[]
  activeId?: string
  onSelect: (id: string) => void
  searching?: boolean
  labels: { dialog: string; input: string; placeholder: string; runFirst: string; close: string }
  container?: unknown
}

function CommandPalette({ open, onClose, query, onQueryChange, sections, activeId, onSelect, searching, labels }: CommandPaletteProps) {
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable flexGrow={1} backgroundColor={tokens['surface.scrim']} paddingTop={80} paddingHorizontal={16} onPress={onClose}>
        <Box accessibilityLabel={labels.dialog} borderRadius={px(tokens['radius.dialog'])} backgroundColor={tokens['surface.panel']} overflow="hidden" onStartShouldSetResponder={() => true}>
          <Box flexDirection="row" alignItems="center" gap={10} height={50} paddingHorizontal={16}>
            <Icon name="search" size={16} color={tokens['text.tertiary']} />
            <TextInput
              accessibilityLabel={labels.input}
              placeholder={labels.placeholder}
              placeholderTextColor={tokens['text.tertiary']}
              value={query}
              onChangeText={onQueryChange}
              autoFocus
              style={{ flexGrow: 1, fontSize: 15, color: tokens['text.primary'] }}
            />
            {searching && <Spinner />}
          </Box>
          <ScrollView style={{ maxHeight: 420 }}>
            {sections.map((section) => (
              <Box key={section.id}>
                <Text font="mono" fontSize={10.5} paddingVertical={6} paddingHorizontal={16} color={tokens['text.tertiary']}>
                  {section.title}
                </Text>
                {section.error ? (
                  <Pressable onPress={section.error.onRetry} paddingVertical={8} paddingHorizontal={16}>
                    <Text fontSize={12.5} color={tokens['color.bad-ink']}>
                      {section.error.message} {section.error.retryLabel}
                    </Text>
                  </Pressable>
                ) : section.loading ? (
                  <Box paddingHorizontal={16} gap={10} paddingVertical={6}>
                    {[0, 1, 2].map((index) => (
                      <Skeleton key={index} height={12} width={200 - index * 30} />
                    ))}
                  </Box>
                ) : (
                  section.items.map((item) => (
                    <Pressable key={item.id} onPress={() => onSelect(item.id)} flexDirection="row" alignItems="center" gap={10} height={44} paddingHorizontal={16} backgroundColor={item.id === activeId ? tokens['surface.hover'] : 'transparent'}>
                      {item.icon && <Icon name={item.icon} size={14} color={tokens['text.tertiary']} />}
                      <Text flexGrow={1} fontSize={13.5} color={tokens['text.primary']}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))
                )}
              </Box>
            ))}
          </ScrollView>
        </Box>
      </Pressable>
    </Modal>
  )
}

export { CommandPalette }
export type { CommandPaletteProps, PaletteItem, PaletteSection }
