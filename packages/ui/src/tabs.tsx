import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Pressable, Text } from './layout'
import { PulseDot } from './loading'
import { Tooltip } from './tooltip'
import { useWindowChrome } from './window-chrome'
import { TabStrip } from './tab-strip'

// Underlined tabs that switch panels. The active tab carries a 2px accent
// underline; an AI tab shows an accent dot; a count shows unread or totals.

type TabsProps = {
  /** Accessible name of the tab list. */
  label: string
  children: ReactNode
}

function Tabs({ label, children }: TabsProps) {
  const macosWindow = useWindowChrome()
  return (
    <TabStrip drag={macosWindow}>
      <Box dragRegion={macosWindow} role="tablist" aria-label={label} display="flex" gap={18} height={42} minWidth="100%" width="max-content" borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
        {children}
      </Box>
    </TabStrip>
  )
}

type TabProps = {
  selected: boolean
  onPress: () => void
  children: string
  disabled?: boolean
  /** Accent dot before the label: the AI tab. */
  ai?: boolean
  /** Unread or total count, shown in mono. */
  count?: number
  /** Count is a badge for unread items. */
  unread?: boolean
  controls?: string
  /** Key that selects the tab, shown in its tooltip ("⌘2"). */
  shortcut?: string
  /** Same key for assistive technology ("Meta+2"). */
  keyshortcuts?: string
}

function Tab({ selected, onPress, children, disabled, ai, count, unread, controls, shortcut, keyshortcuts }: TabProps) {
  const tab = (
    <Pressable
      role="tab"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      aria-controls={controls}
      aria-keyshortcuts={keyshortcuts}
      disabled={disabled}
      onClick={() => !disabled && onPress()}
      display="flex"
      alignItems="center"
      gap={6}
      fontSize={12.5}
      fontWeight={selected ? 500 : 400}
      color={selected ? tokens['text.primary'] : tokens['text.tertiary']}
      hoverStyle={disabled ? undefined : { color: tokens['text.primary'] }}
      borderBottomWidth={2}
      borderStyle="solid"
      borderBottomColor={selected ? tokens['accent.default'] : 'transparent'}
      marginBottom={-1}
      opacity={disabled ? 0.6 : 1}
      cursor={disabled ? 'default' : 'pointer'}
      whiteSpace="nowrap"
    >
      {ai && <PulseDot width={6} height={6} />}
      {children}
      {count !== undefined &&
        (unread ? (
          <Text minWidth={15} height={15} paddingHorizontal={4} borderRadius={999} backgroundColor={tokens['mentions.badgeBackground']} color={tokens['mentions.badgeText']} font="mono" fontSize={9} fontWeight={600} display="flex" alignItems="center" justifyContent="center">
            {count}
          </Text>
        ) : (
          <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
            {count}
          </Text>
        ))}
    </Pressable>
  )
  return shortcut ? <Tooltip label={children} shortcut={shortcut}>{tab}</Tooltip> : tab
}

export { Tabs, Tab }
export type { TabsProps, TabProps }
