import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { px } from './lib/units'
import { PlainSelect } from './plain'

// Filters a data page. The active pill is inverted. Three kinds: a tab with a
// count (mutually exclusive, one always active), a toggle (on / off) and a
// select, grouped in a FilterPillGroup and separated by a divider.

type FilterPillProps = {
  children: string
  active?: boolean
  onPress: () => void
  /** Count inside the pill; null while there is no data (shows a dash). */
  count?: number | null
  /** tab: one of a mutually exclusive set; toggle: on / off. */
  kind?: 'tab' | 'toggle'
  disabled?: boolean
}

function FilterPill({ children, active, onPress, count, kind = 'toggle', disabled }: FilterPillProps) {
  const tab = kind === 'tab'
  const countText = count === null ? '—' : count
  return (
    <Pressable
      role={tab ? 'tab' : undefined}
      aria-selected={tab ? !!active : undefined}
      aria-pressed={tab ? undefined : !!active}
      aria-label={count !== undefined ? `${children}, ${countText}` : undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => !disabled && onPress()}
      display="inline-flex"
      alignItems="center"
      gap={6}
      height={px(tokens['size.control'])}
      paddingHorizontal={12}
      borderRadius={px(tokens['radius.pill'])}
      fontSize={12.5}
      borderWidth={1}
      borderStyle="solid"
      borderColor={active ? tokens['text.primary'] : tokens['border.default']}
      backgroundColor={active ? tokens['text.primary'] : tokens['surface.panel']}
      color={active ? tokens['surface.page'] : tokens['text.secondary']}
      hoverStyle={disabled || active ? undefined : { color: tokens['text.primary'], borderColor: tokens['border.strong'] }}
      opacity={disabled ? 0.6 : 1}
      cursor={disabled ? 'default' : 'pointer'}
      whiteSpace="nowrap"
    >
      {children}
      {count !== undefined && (
        <Text font="mono" fontSize={11} color={active ? undefined : tokens['text.tertiary']} opacity={active ? 0.7 : 1} aria-hidden>
          {countText}
        </Text>
      )}
    </Pressable>
  )
}

type FilterPillSelectProps = {
  /** Visually hidden name of the select. */
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly { value: string; label: string }[]
}

function FilterPillSelect({ label, value, onValueChange, options }: FilterPillSelectProps) {
  return (
    <Box position="relative" display="inline-flex" alignItems="center" height={px(tokens['size.control'])}>
      <PlainSelect
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        height={px(tokens['size.control'])}
        paddingLeft={12}
        paddingRight={30}
        borderRadius={px(tokens['radius.pill'])}
        borderWidth={1}
        borderStyle="solid"
        borderColor={tokens['border.default']}
        backgroundColor={tokens['surface.panel']}
        color={tokens['text.secondary']}
        fontSize={12.5}
        cursor="pointer"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </PlainSelect>
      <Box position="absolute" right={11} pointerEvents="none" aria-hidden>
        <Icon name="down" size={11} color={tokens['text.tertiary']} />
      </Box>
    </Box>
  )
}

function FilterPillDivider() {
  return <Box width={1} height={20} marginHorizontal={4} backgroundColor={tokens['border.default']} aria-hidden />
}

type FilterPillGroupProps = {
  label: string
  /** tablist for tabs with a count; group for toggles. */
  semantics?: 'tablist' | 'group'
  children: ReactNode
}

function FilterPillGroup({ label, semantics = 'tablist', children }: FilterPillGroupProps) {
  return (
    <Box role={semantics} aria-label={label} display="flex" alignItems="center" gap={6}>
      {children}
    </Box>
  )
}

export { FilterPill, FilterPillDivider, FilterPillGroup, FilterPillSelect }
export type { FilterPillProps, FilterPillGroupProps, FilterPillSelectProps }
