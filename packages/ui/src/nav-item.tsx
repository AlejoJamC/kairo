import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'
import { PulseDot } from './loading'
import { VisuallyHidden } from './lib/visually-hidden'

// Navigation entry in the sidebar (30px) and the settings sub-navigation
// (32px). Collapsed, only the icon shows and the label moves to the title.

type NavItemProps = {
  icon: IconName
  label: string
  onPress: () => void
  active?: boolean
  /** Sidebar (default) or settings sub-navigation. */
  variant?: 'sidebar' | 'settings'
  /** Icon only; the label is kept in the title. */
  collapsed?: boolean
  count?: number
  /** Screen reader text of the count, for example "12 tickets". */
  countLabel?: string
  /** The count belongs to overdue tickets. */
  overdue?: boolean
  /** The view is updating: a live dot before the count. */
  live?: boolean
  /** The count failed to load: shows a dash and a red dot. */
  countError?: boolean
  disabled?: boolean
}

function NavItem({ icon, label, onPress, active, variant = 'sidebar', collapsed, count, countLabel, overdue, live, countError, disabled }: NavItemProps) {
  const settings = variant === 'settings'
  const showCount = !disabled && !collapsed && (countError || count !== undefined)
  return (
    <Pressable
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={collapsed ? label : undefined}
      onClick={() => !disabled && onPress()}
      display="flex"
      width="100%"
      alignItems="center"
      justifyContent={collapsed ? 'center' : 'flex-start'}
      gap={10}
      height={settings ? 32 : 30}
      paddingHorizontal={collapsed ? 8 : 10}
      borderRadius={6}
      textAlign="left"
      fontSize={13}
      fontWeight={active ? 500 : 400}
      color={active ? tokens['text.primary'] : tokens['text.secondary']}
      backgroundColor={active ? (settings ? tokens['surface.hover'] : tokens['surface.panel']) : 'transparent'}
      borderWidth={1}
      borderStyle="solid"
      borderColor={active && !settings ? tokens['border.default'] : 'transparent'}
      boxShadow={active && !settings ? tokens['shadow.xs'] : 'none'}
      hoverStyle={disabled || active ? undefined : { backgroundColor: tokens['surface.hover'], color: tokens['text.primary'] }}
      opacity={disabled ? 0.6 : 1}
      cursor={disabled ? 'default' : 'pointer'}
    >
      <Icon name={icon} size={settings ? 15 : 16} />
      {!collapsed && <Text flexGrow={1} flexShrink={1} flexBasis="0%" whiteSpace="nowrap">{label}</Text>}
      {showCount && (
        <Box display="flex" alignItems="center" gap={4}>
          {live && <PulseDot width={5} height={5} />}
          {countError && <Box width={5} height={5} borderRadius={999} backgroundColor={tokens['color.bad']} />}
          <Text font="mono" fontSize={11} color={overdue ? tokens['sla.overdueText'] : active ? tokens['accent.ink'] : tokens['text.tertiary']}>
            {countError ? '—' : count !== undefined && count > 99 ? '99+' : count}
          </Text>
          {countLabel && <VisuallyHidden>{countLabel}</VisuallyHidden>}
        </Box>
      )}
    </Pressable>
  )
}

export { NavItem }
export type { NavItemProps }
