import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { Kbd } from './kbd'
import { Box, Pressable, Text } from './layout'
import { Spinner } from './loading'
import { Icon } from './icon'
import { px } from './lib/units'
import type { MentionChipProps, MentionMenuProps } from './mention-menu-types'

// Mentions inside an internal note: the menu that opens when typing @ in the
// composer and the chip of each mentioned person.

/** Highlights the matched run inside a name. */
function highlightMatch(text: string, query: string) {
  if (!query) return text
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <Text backgroundColor={tokens['accent.soft']} color={tokens['accent.ink']} borderRadius={2}>
        {text.slice(at, at + query.length)}
      </Text>
      {text.slice(at + query.length)}
    </>
  )
}

function MentionMenu({ title, query, options, activeIndex, loading, error, onPick, onHover, testId, idPrefix = 'mention-option', labels }: MentionMenuProps) {
  const empty = !loading && !error && options.length === 0
  return (
    <Box
      data-testid={testId}
      role="listbox"
      aria-label={title}
      position="absolute"
      bottom="calc(100% + 6px)"
      left={0}
      width={300}
      maxWidth="100%"
      zIndex={30}
      overflowX="hidden"
      overflowY="hidden"
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.input'])}
      backgroundColor={tokens['surface.panel']}
      boxShadow={tokens['shadow.pop']}
    >
      <Box display="flex" alignItems="center" gap={6} paddingVertical={7} paddingHorizontal={11} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']} backgroundColor={tokens['surface.sunken']}>
        <Text font="mono" fontSize={9.5} color={tokens['text.tertiary']} textTransform="uppercase" letterSpacing={0.57}>
          {title}
        </Text>
        {query && (
          <Text font="mono" fontSize={10.5} color={tokens['accent.ink']}>
            @{query}
          </Text>
        )}
        <Text marginLeft="auto" font="mono" fontSize={10} color={tokens['text.tertiary']}>
          {loading || error ? '' : labels.counter}
        </Text>
      </Box>
      {loading && (
        <Box display="flex" alignItems="center" gap={9} height={40} paddingHorizontal={12}>
          <Spinner />
          <Text fontSize={12.5} color={tokens['text.tertiary']}>
            {labels.searching}
          </Text>
        </Box>
      )}
      {error && (
        <Text tag="div" display="block" paddingVertical={18} paddingHorizontal={12} textAlign="center" fontSize={12.5} color={tokens['text.tertiary']}>
          {error}
        </Text>
      )}
      {empty && (
        <Text tag="div" display="block" paddingVertical={18} paddingHorizontal={12} textAlign="center" fontSize={12.5} color={tokens['text.tertiary']}>
          {labels.empty}
        </Text>
      )}
      {!loading && !error && !empty && (
        <Box padding={4} maxHeight={240} scroll>
          {options.map((option, index) => {
            const active = index === activeIndex
            return (
              <Pressable
                key={option.id}
                id={`${idPrefix}-${option.id}`}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onPick(option.id)
                }}
                onMouseEnter={() => onHover?.(index)}
                display="flex"
                alignItems="center"
                gap={9}
                width="100%"
                height={40}
                paddingHorizontal={8}
                borderRadius={px(tokens['radius.control'])}
                textAlign="left"
                backgroundColor={active ? tokens['surface.hover'] : 'transparent'}
              >
                <Avatar name={option.name} email={option.email} seed={option.id} size={24} />
                <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
                  <Text tag="div" display="block" fontSize={12.5} fontWeight={500} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                    {highlightMatch(option.name, query)}
                  </Text>
                  <Text tag="div" display="block" fontSize={10.5} font="mono" color={tokens['text.tertiary']}>
                    {option.role}
                  </Text>
                </Box>
              </Pressable>
            )
          })}
        </Box>
      )}
      <Box display="flex" gap={10} paddingVertical={6} paddingHorizontal={11} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']} backgroundColor={tokens['surface.sunken']}>
        {(
          [
            ['↵', labels.keyInsert],
            ['esc', labels.keyClose],
          ] as const
        ).map(([key, text]) => (
          <Box key={key} display="flex" alignItems="center" gap={4}>
            <Kbd>{key}</Kbd>
            <Text fontSize={10.5} color={tokens['text.tertiary']}>
              {text}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/** The chip of one mentioned person, in the note row of the composer. */
function MentionChip({ name, email, seed, onRemove, removeLabel }: MentionChipProps) {
  return (
    <Box
      tag="span"
      display="inline-flex"
      alignItems="center"
      gap={5}
      height={22}
      paddingLeft={3}
      paddingRight={4}
      borderRadius={px(tokens['radius.pill'])}
      backgroundColor={tokens['mentions.chipBackground']}
      boxShadow={`inset 0 0 0 1px ${tokens['mentions.chipBorder']}`}
    >
      <Avatar name={name} email={email} seed={seed} size={16} />
      <Text fontSize={11.5} fontWeight={500} color={tokens['mentions.chipText']}>
        @{name.split(/\s+/)[0]}
      </Text>
      <Pressable
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        width={16}
        height={16}
        borderRadius={999}
        color={tokens['mentions.chipText']}
        hoverStyle={{ backgroundColor: tokens['mentions.chipBackground'] }}
      >
        <Icon name="x" size={9} />
      </Pressable>
    </Box>
  )
}

export { MentionMenu, MentionChip }
export type { MentionChipProps, MentionMenuProps, MentionOption } from './mention-menu-types'
