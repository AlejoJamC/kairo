import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Badge } from './badge'
import { IconButton } from './button'
import { Icon, type IconName } from './icon'
import { Kbd } from './kbd'
import { Box, Pressable, Text } from './layout'
import { Menu, MenuItem } from './menu'
import { NavItem } from './nav-item'
import { PlainSelect } from './plain'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Tooltip } from './tooltip'
import { px } from './lib/units'
import { useWindowChrome, WindowControlsSlot } from './window-chrome'

// First column of the app shell: brand, notifications, search, navigation,
// language and account. Collapses to icons only.

type SidebarEntry = {
  id: string
  icon: IconName
  label: string
  active?: boolean
  count?: number
  /** Screen reader text of the count ("12 tickets"). */
  countLabel?: string
  /** The view is updating: live dot before the count. */
  live?: boolean
  /** Collapsed rail: a dot on the icon (for example Triage with tickets). */
  dot?: boolean
  onSelect: () => void
}

type SidebarLanguage = {
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
}

type SidebarProps = {
  collapsed: boolean
  onToggleCollapsed: () => void
  /** The bell with its popover (see SidebarBell). */
  bell: ReactNode
  search: {
    label: string
    /** Shorter text for the desktop sidebar ("Search or run…"); `label` stays the accessible name. */
    shortLabel?: string
    shortcut: string
    onOpen: () => void
  }
  /** Two groups: queues and knowledge, then clients and settings. */
  groups: readonly (readonly SidebarEntry[])[]
  language: SidebarLanguage
  /** The account button with its popover (AccountMenu). */
  account: ReactNode
  /** Desktop: the shortcut of the collapse button, which then sits in the footer ("⌃⌘S"). */
  collapseShortcut?: string
  /** Desktop, collapsed: surface of the column next to the rail, which the window row takes. */
  neighbor?: 'panel' | 'page'
  labels: {
    /** Accessible name of the navigation ("Workspace"). */
    nav: string
    collapse: string
    expand: string
    language: string
  }
}

type SidebarBellProps = {
  /** Total unread (notifications plus mentions); 0 or null shows no count. */
  count?: number | null
  /** There is an unread mention among them. */
  hasMention?: boolean
  /** "Notifications". */
  label: string
  /** "3 unread". */
  unreadLabel?: string
  open?: boolean
  [key: string]: unknown
}

/** The bell button of the sidebar header: count badge and unread-mention dot. */
function SidebarBell({ count, hasMention, label, unreadLabel, open, ...rest }: SidebarBellProps) {
  return (
    <IconButton label={count && unreadLabel ? `${label}, ${unreadLabel}` : label} backgroundColor={open ? tokens['surface.hover'] : undefined} {...(rest as object)}>
      <Box position="relative" display="flex">
        <Icon name="bell" size={16} color={open ? tokens['text.primary'] : tokens['text.secondary']} />
        {!!count && (
          <Box position="absolute" top={-7} right={-9} borderRadius={999} boxShadow={`0 0 0 2px ${tokens['surface.sidebar']}`}>
            <Badge variant="bell">{count}</Badge>
          </Box>
        )}
        {hasMention && <Box position="absolute" bottom={-2} right={-2} width={7} height={7} circle backgroundColor={tokens['mentions.unreadDot']} />}
      </Box>
    </IconButton>
  )
}

function Brand() {
  return (
    <Box width={24} height={24} borderRadius={px(tokens['radius.sm'])} backgroundColor={tokens['accent.default']} display="inline-flex" alignItems="center" justifyContent="center" flexShrink={0} aria-hidden>
      <Icon name="zap" size={13} color={tokens['text.onAccent']} strokeWidth={2.4} />
    </Box>
  )
}

function LanguageControl({ collapsed, language, label }: { collapsed: boolean; language: SidebarLanguage; label: string }) {
  if (collapsed) {
    return (
      <Popover>
        <PopoverTrigger>
          <IconButton label={label} width="100%">
            <Icon name="globe" size={14} color={tokens['text.tertiary']} />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent role="menu" label={label} width={160} side="right" align="end">
          <Menu label={label}>
            {language.options.map((option) => (
              <MenuItem key={option.value} label={option.label} current={option.value === language.value} onSelect={() => language.onChange(option.value)} />
            ))}
          </Menu>
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={8}
      height={px(tokens['size.control'])}
      paddingHorizontal={9}
      borderRadius={px(tokens['radius.control'])}
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      backgroundColor={tokens['surface.panel']}
      hoverStyle={{ backgroundColor: tokens['surface.hover'] }}
    >
      <Icon name="globe" size={14} color={tokens['text.tertiary']} />
      <PlainSelect
        aria-label={label}
        value={language.value}
        onChange={(event) => language.onChange(event.target.value)}
        flexGrow={1}
        flexShrink={1}
        flexBasis="0%"
        minWidth={0}
        backgroundColor="transparent"
        borderWidth={0}
        fontSize={12.5}
        color={tokens['text.primary']}
        outlineWidth={0}
        cursor="pointer"
      >
        {language.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </PlainSelect>
    </Box>
  )
}

function Sidebar({ collapsed, onToggleCollapsed, bell, search, groups, language, account, collapseShortcut, neighbor = 'panel', labels }: SidebarProps) {
  const macosWindow = useWindowChrome()
  const width = px(tokens[collapsed ? 'layout.sidebar-collapsed' : 'layout.sidebar'])
  const collapseButton = (
    <Tooltip label={collapsed ? labels.expand : labels.collapse} shortcut={collapseShortcut} side="right">
      <IconButton
        label={collapsed ? labels.expand : labels.collapse}
        aria-expanded={!collapsed}
        {...(collapseShortcut ? { 'aria-keyshortcuts': 'Control+Meta+S' } : null)}
        width={collapsed ? '100%' : undefined}
        onPress={onToggleCollapsed}
      >
        <Icon name="sidebar" size={16} color={tokens['text.tertiary']} />
      </IconButton>
    </Tooltip>
  )

  const searchLabel = macosWindow ? (search.shortLabel ?? search.label) : search.label
  const searchButton = collapsed ? (
    <Tooltip label={search.label} shortcut={search.shortcut} side="right">
      <IconButton label={search.label} width="100%" onPress={search.onOpen}>
        <Icon name="search" size={14} color={tokens['text.tertiary']} />
      </IconButton>
    </Tooltip>
  ) : (
    <Tooltip label={search.label} shortcut={search.shortcut} side="right" disabled={!macosWindow}>
      <Pressable
        aria-label={search.label}
        onClick={search.onOpen}
        display="flex"
        alignItems="center"
        gap={8}
        width="100%"
        height={30}
        paddingHorizontal={10}
        borderRadius={px(tokens['radius.sm'])}
        borderWidth={1}
        borderStyle="solid"
        borderColor={tokens['border.default']}
        backgroundColor={tokens['surface.panel']}
        boxShadow={tokens['shadow.xs']}
        hoverStyle={{ backgroundColor: tokens['surface.hover'] }}
      >
        <Icon name="search" size={14} color={tokens['text.tertiary']} />
        <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12.5} color={tokens['text.tertiary']} textAlign="left" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {searchLabel}
        </Text>
        <Kbd alignSelf="center">{search.shortcut}</Kbd>
      </Pressable>
    </Tooltip>
  )

  const navigation = groups.map((group, index) => (
    <Box key={index} display="flex" flexDirection="column" gap={2}>
      {index > 0 && <Box height={1} marginHorizontal={6} marginBottom={12} backgroundColor={tokens['border.default']} aria-hidden />}
      {group.map((entry) => {
        const item = (
          <NavItem
            icon={entry.icon}
            label={entry.label}
            active={entry.active}
            collapsed={collapsed}
            count={entry.count}
            countLabel={entry.countLabel}
            live={entry.live}
            railDot={entry.dot}
            onPress={entry.onSelect}
          />
        )
        const name = entry.count !== undefined ? `${entry.label} · ${entry.count}` : entry.label
        return <Box key={entry.id}>{collapsed ? <Tooltip label={name} side="right">{item}</Tooltip> : item}</Box>
      })}
    </Box>
  ))

  if (!macosWindow) {
    return (
      <Box
        tag="nav"
        aria-label={labels.nav}
        display="flex"
        flexDirection="column"
        gap={14}
        flexShrink={0}
        width={width}
        paddingTop={12}
        paddingBottom={12}
        paddingHorizontal={10}
        backgroundColor={tokens['surface.sidebar']}
        borderRightWidth={1}
        borderStyle="solid"
        borderRightColor={tokens['border.default']}
        transition="width 160ms ease"
      >
        <Box display="flex" flexDirection={collapsed ? 'column' : 'row'} alignItems="center" gap={6} paddingLeft={collapsed ? 0 : 4} paddingRight={collapsed ? 0 : 2}>
          <Brand />
          {!collapsed && (
            <Text fontSize={14} fontWeight={600} letterSpacing={-0.14} color={tokens['text.primary']} marginLeft={4} flexGrow={1}>
              Kairo
            </Text>
          )}
          {bell}
          {collapseButton}
        </Box>
        {searchButton}
        {navigation}
        <Box flexGrow={1} />
        <Box display="flex" flexDirection="column" gap={6}>
          <LanguageControl collapsed={collapsed} language={language} label={labels.language} />
          {account}
        </Box>
      </Box>
    )
  }

  // macOS desktop: the 44px window row is the header and holds the system controls.
  return (
    <Box
      tag="nav"
      aria-label={labels.nav}
      display="flex"
      flexDirection="column"
      flexShrink={0}
      position="relative"
      width={width}
      backgroundColor={tokens['surface.sidebar']}
      borderRightWidth={collapsed ? 0 : 1}
      borderStyle="solid"
      borderRightColor={tokens['border.default']}
      transition="width 160ms ease"
    >
      <Box dragRegion display="flex" alignItems="center" height={44} flexShrink={0} width="100%" backgroundColor={collapsed ? tokens[neighbor === 'page' ? 'surface.page' : 'surface.panel'] : undefined}>
        <Box dragRegion width={14} height={44} flexShrink={0} />
        <WindowControlsSlot />
        {!collapsed && (
          <>
            <Box dragRegion width={14} height={44} flexShrink={0} />
            <Brand />
            <Text dragRegion fontSize={14} fontWeight={600} letterSpacing={-0.14} color={tokens['text.primary']} marginLeft={10}>
              Kairo
            </Text>
            <Box dragRegion flexGrow={1} height={44} />
            <Box paddingRight={10}>{bell}</Box>
          </>
        )}
      </Box>
      {collapsed && <Box position="absolute" top={44} bottom={0} right={0} width={1} backgroundColor={tokens['border.default']} aria-hidden />}
      <Box display="flex" flexDirection="column" gap={14} flexGrow={1} flexShrink={1} flexBasis="0%" minHeight={0} paddingTop={collapsed ? 6 : 4} paddingBottom={12} paddingHorizontal={10}>
        {collapsed && (
          <Box display="flex" flexDirection="column" alignItems="center" gap={6}>
            <Brand />
            {bell}
          </Box>
        )}
        {searchButton}
        {navigation}
        <Box flexGrow={1} />
        <Box display="flex" flexDirection="column" gap={6}>
          {collapsed ? (
            <>
              <LanguageControl collapsed language={language} label={labels.language} />
              {collapseButton}
            </>
          ) : (
            <Box display="flex" alignItems="center" gap={6}>
              <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
                <LanguageControl collapsed={false} language={language} label={labels.language} />
              </Box>
              {collapseButton}
            </Box>
          )}
          {account}
        </Box>
      </Box>
    </Box>
  )
}

export { Sidebar, SidebarBell }
export type { SidebarBellProps, SidebarEntry, SidebarLanguage, SidebarProps }
