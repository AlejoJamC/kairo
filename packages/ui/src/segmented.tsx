import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Pressable, Text } from './layout'

// Switches between two or three mutually exclusive modes in place, or filters
// a list with counts. The active segment sits on the panel surface with a ring.

type SegmentedItem<V extends string> = {
  value: V
  label: string
  /** Leading glyph, for example the priority bars of a list filter. */
  icon?: ReactNode
  /** Count shown after the label (the view-tab variant). */
  count?: number | null
  /** Amber styling for the internal-note mode. */
  tone?: 'note'
  disabled?: boolean
  /** Key that selects the segment, shown in mono after the label (decorative). */
  shortcut?: string
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
  /** track: modes on a shared track; tabs: 28px list filters without a track, with counts. */
  variant?: 'track' | 'tabs'
  /** Equal segments across the full width (the theme switch of the account menu). */
  fullWidth?: boolean
}

function Segmented<V extends string>({ items, value, onChange, label, semantics = 'tablist', size = 'md', variant = 'track', fullWidth }: SegmentedProps<V>) {
  const tabs = variant === 'tabs'
  const height = tabs ? 28 : size === 'lg' ? 34 : 26
  return (
    <Box
      role={semantics === 'tablist' ? 'tablist' : 'group'}
      aria-label={label}
      display={fullWidth ? 'flex' : 'inline-flex'}
      padding={tabs ? 0 : 2}
      gap={tabs ? 4 : 2}
      borderRadius={8}
      backgroundColor={tabs ? 'transparent' : tokens['surface.hover']}
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
            justifyContent={fullWidth ? 'center' : undefined}
            flexGrow={fullWidth ? 1 : undefined}
            flexBasis={fullWidth ? '0%' : undefined}
            gap={tabs ? 6 : 5}
            height={height}
            paddingHorizontal={size === 'lg' && !tabs ? 14 : 10}
            borderRadius={tabs ? 7 : 6}
            fontSize={12}
            fontWeight={500}
            color={active ? (note ? tokens['notes.label'] : tokens['text.primary']) : tokens['text.tertiary']}
            hoverStyle={item.disabled || active ? undefined : tabs ? { color: tokens['text.primary'], backgroundColor: tokens['surface.hover'] } : { color: tokens['text.primary'] }}
            backgroundColor={active ? (note ? tokens['notes.background'] : tokens['surface.panel']) : 'transparent'}
            borderWidth={1}
            borderStyle="solid"
            borderColor={active ? (note ? tokens['notes.border'] : tokens['border.default']) : 'transparent'}
            boxShadow={active ? tokens['shadow.xs'] : 'none'}
            opacity={item.disabled ? 0.6 : 1}
            cursor={item.disabled ? 'default' : 'pointer'}
            whiteSpace="nowrap"
          >
            {item.icon}
            {item.label}
            {item.shortcut && (
              <Text font="mono" fontSize={10.5} opacity={0.65} aria-hidden>
                {item.shortcut}
              </Text>
            )}
            {item.count !== undefined && (
              <Text font="mono" fontSize={tabs ? 10.5 : 11} opacity={0.65}>
                {item.count === null ? '—' : item.count}
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
