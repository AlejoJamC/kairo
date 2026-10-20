import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { Box, Pressable, Text } from './layout'
import { px } from './lib/units'
import type { MentionChipProps, MentionMenuProps } from './mention-menu-types'

function MentionMenu({ title, query, options, activeIndex, loading, error, onPick, labels }: MentionMenuProps) {
  return (
    <Box accessibilityLabel={title} borderWidth={1} borderColor={tokens['border.default']} borderRadius={px(tokens['radius.input'])} backgroundColor={tokens['surface.panel']} marginBottom={6} overflow="hidden">
      <Text font="mono" fontSize={9.5} paddingVertical={7} paddingHorizontal={11} color={tokens['text.tertiary']}>
        {title}
        {query ? ` @${query}` : ''}
      </Text>
      {loading && (
        <Text fontSize={12.5} padding={18} color={tokens['text.tertiary']}>
          {labels.searching}
        </Text>
      )}
      {error && (
        <Text fontSize={12.5} padding={18} color={tokens['text.tertiary']}>
          {error}
        </Text>
      )}
      {!loading && !error && options.length === 0 && (
        <Text fontSize={12.5} padding={18} color={tokens['text.secondary']}>
          {labels.empty}
        </Text>
      )}
      {options.map((option, index) => (
        <Pressable key={option.id} onPress={() => onPick(option.id)} flexDirection="row" alignItems="center" gap={10} paddingVertical={8} paddingHorizontal={12} backgroundColor={index === activeIndex ? tokens['surface.hover'] : 'transparent'}>
          <Avatar name={option.name} email={option.email} seed={option.id} size={24} />
          <Text flexGrow={1} fontSize={13} fontWeight={500} color={tokens['text.primary']}>
            {option.name}
          </Text>
          <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
            {option.role}
          </Text>
        </Pressable>
      ))}
    </Box>
  )
}

function MentionChip({ name, onRemove, removeLabel }: MentionChipProps) {
  return (
    <Pressable accessibilityLabel={removeLabel} onPress={onRemove} flexDirection="row" alignItems="center" gap={4} paddingHorizontal={8} height={22} borderRadius={px(tokens['radius.pill'])} backgroundColor={tokens['mentions.chipBackground']}>
      <Text fontSize={11.5} fontWeight={500} color={tokens['mentions.chipText']}>
        @{name.split(/\s+/)[0]}
      </Text>
    </Pressable>
  )
}

export { MentionMenu, MentionChip }
export type { MentionChipProps, MentionMenuProps, MentionOption } from './mention-menu-types'
