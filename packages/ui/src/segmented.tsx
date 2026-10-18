import { tokens } from '@kairo/tokens'
import { Box, Pressable, Text } from './layout'

// Switches between two or three mutually exclusive modes in place, or filters
// a list with counts. The active segment sits on the panel surface with a ring.

type SegmentedItem<V extends string> = {
  value: V
  label: string
  /** Count shown after the label (the view-tab variant). */
  count?: number
  /** Amber styling for the internal-note mode. */
  tone?: 'note'
  disabled?: boolean
}

type SegmentedProps<V extends string> = {
  items: readonly SegmentedItem<V>[]
  value: V
  onChange: (value: V) => void
  /** Accessible name of the group. */
  label: string
  /** tablist for composer modes; group (aria-pressed) for language and billing period. */
  semantics?: 'tablist' | 'group'
  size?: 'md' | 'lg'
}

function Segmented<V extends string>({ items, value, onChange, label, semantics = 'tablist', size = 'md' }: SegmentedProps<V>) {
  const height = size === 'lg' ? 34 : 26
  return (
    <Box
      role={semantics === 'tablist' ? 'tablist' : 'group'}
      aria-label={label}
      display="inline-flex"
      padding={2}
      gap={2}
      borderRadius={8}
      backgroundColor={tokens['surface.hover']}
    >
      {items.map((item) => {
        const active = item.value === value
        const note = item.tone === 'note'
        return (
          <Pressable
            key={item.value}
            role={semantics === 'tablist' ? 'tab' : undefined}
            aria-selected={semantics === 'tablist' ? active : undefined}
            aria-pressed={semantics === 'group' ? active : undefined}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.value)}
            display="flex"
            alignItems="center"
            gap={5}
            height={height}
            paddingHorizontal={size === 'lg' ? 14 : 10}
            borderRadius={6}
            fontSize={12}
            fontWeight={500}
            color={active ? (note ? tokens['notes.label'] : tokens['text.primary']) : tokens['text.tertiary']}
            hoverStyle={item.disabled || active ? undefined : { color: tokens['text.primary'] }}
            backgroundColor={active ? (note ? tokens['notes.background'] : tokens['surface.panel']) : 'transparent'}
            borderWidth={1}
            borderStyle="solid"
            borderColor={active ? (note ? tokens['notes.border'] : tokens['border.default']) : 'transparent'}
            boxShadow={active ? tokens['shadow.xs'] : 'none'}
            opacity={item.disabled ? 0.6 : 1}
            cursor={item.disabled ? 'default' : 'pointer'}
            whiteSpace="nowrap"
          >
            {item.label}
            {item.count !== undefined && (
              <Text font="mono" fontSize={11} opacity={0.65}>
                {item.count}
              </Text>
            )}
          </Pressable>
        )
      })}
    </Box>
  )
}

export { Segmented }
export type { SegmentedProps, SegmentedItem }
