import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { Icon } from './icon'
import { Kbd } from './kbd'
import { Box, Pressable, Text } from './layout'
import { Menu, MenuItem } from './menu'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Segmented } from './segmented'
import { px } from './lib/units'

// Account popover of the sidebar: presence, appearance and session actions. It
// opens upward from the account button.

type AccountPresence = 'online' | 'away' | 'invisible'
type AccountTheme = 'light' | 'dark'

const PRESENCE_DOT: Record<AccountPresence, string> = {
  online: tokens['color.ok'],
  away: tokens['color.warn'],
  invisible: tokens['color.p3'],
}

type AccountMenuProps = {
  /** Workspace name, shown in the button and in the header. */
  name: string
  email?: string | null
  presence: AccountPresence
  onPresenceChange: (presence: AccountPresence) => void
  theme: AccountTheme
  onThemeChange: (theme: AccountTheme) => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onSignOut: () => void
  /** Sidebar collapsed: the button shows only the avatar. */
  collapsed?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  labels: {
    /** Accessible name of the button and of the dialog ("Account"). */
    account: string
    presenceTitle: string
    presence: Record<AccountPresence, string>
    appearance: string
    light: string
    dark: string
    settings: string
    shortcuts: string
    signOut: string
  }
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text tag="div" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']}>
      {children}
    </Text>
  )
}

function AccountMenu({ name, email, presence, onPresenceChange, theme, onThemeChange, onOpenSettings, onOpenShortcuts, onSignOut, collapsed, open, onOpenChange, labels }: AccountMenuProps) {
  const avatarPresence = presence
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger>
        <Pressable
          aria-label={labels.account}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={collapsed ? name : undefined}
          display="flex"
          alignItems="center"
          justifyContent={collapsed ? 'center' : 'flex-start'}
          gap={8}
          width="100%"
          height={40}
          paddingHorizontal={collapsed ? 0 : 8}
          borderRadius={px(tokens['radius.control'])}
          borderWidth={collapsed ? 0 : 1}
          borderStyle="solid"
          borderColor={tokens['border.default']}
          backgroundColor={open ? tokens['surface.hover'] : collapsed ? 'transparent' : tokens['surface.panel']}
          boxShadow={collapsed ? 'none' : tokens['shadow.xs']}
          hoverStyle={{ backgroundColor: tokens['surface.hover'] }}
        >
          <Avatar name={name} email={email} size={24} presence={avatarPresence} />
          {!collapsed && (
            <>
              <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12.5} fontWeight={500} color={tokens['text.primary']} textAlign="left" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {name}
              </Text>
              <Icon name="up" size={12} color={tokens['text.tertiary']} />
            </>
          )}
        </Pressable>
      </PopoverTrigger>
      <PopoverContent label={labels.account} side="top" align="start">
        <Box width={270} maxWidth="calc(100vw - 20px)" overflowX="hidden" overflowY="hidden" borderRadius={px(tokens['radius.card'])}>
          <Box display="flex" alignItems="center" gap={10} paddingVertical={12} paddingHorizontal={14} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
            <Avatar name={name} email={email} size={32} />
            <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
              <Text tag="div" display="block" fontWeight={600} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {name}
              </Text>
              <Text tag="div" display="block" fontSize={12} color={tokens['text.tertiary']}>
                {labels.presence[presence]}
              </Text>
            </Box>
          </Box>
          <Box paddingVertical={8} paddingHorizontal={6} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
            <Box paddingHorizontal={10} paddingTop={2} paddingBottom={6}>
              <SectionLabel>{labels.presenceTitle}</SectionLabel>
            </Box>
            <Box role="radiogroup" aria-label={labels.presenceTitle}>
              {(['online', 'away', 'invisible'] as const).map((key) => (
                <Pressable
                  key={key}
                  role="radio"
                  aria-checked={presence === key}
                  onClick={() => onPresenceChange(key)}
                  display="flex"
                  alignItems="center"
                  gap={10}
                  width="100%"
                  height={32}
                  paddingHorizontal={10}
                  borderRadius={px(tokens['radius.control'])}
                  textAlign="left"
                  fontSize={13}
                  fontWeight={presence === key ? 500 : 400}
                  color={presence === key ? tokens['text.primary'] : tokens['text.secondary']}
                  hoverStyle={{ backgroundColor: tokens['surface.hover'], color: tokens['text.primary'] }}
                >
                  <Box width={8} height={8} circle backgroundColor={PRESENCE_DOT[key]} aria-hidden />
                  <Text flexGrow={1}>{labels.presence[key]}</Text>
                </Pressable>
              ))}
            </Box>
          </Box>
          <Box paddingVertical={10} paddingHorizontal={12} display="flex" flexDirection="column" gap={8} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
            <SectionLabel>{labels.appearance}</SectionLabel>
            <Segmented
              semantics="group"
              fullWidth
              label={labels.appearance}
              value={theme}
              onChange={onThemeChange}
              items={[
                { value: 'light', label: labels.light },
                { value: 'dark', label: labels.dark },
              ]}
            />
          </Box>
          <Menu label={labels.account}>
            <MenuItem label={labels.settings} shortcut={<Kbd>⌘,</Kbd>} onSelect={onOpenSettings} />
            <MenuItem label={labels.shortcuts} shortcut={<Kbd>⌘/</Kbd>} onSelect={onOpenShortcuts} />
            <MenuItem destructive label={labels.signOut} onSelect={onSignOut} />
          </Menu>
        </Box>
      </PopoverContent>
    </Popover>
  )
}

export { AccountMenu }
export type { AccountMenuProps, AccountPresence, AccountTheme }
