import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Button, IconButton } from './button'
import { Icon } from './icon'
import { Box, Text } from './layout'

// The public web navigation. TopNav is the sticky bar of the marketing pages;
// AuthHeader carries brand and language only; WizardHeader adds the stepper
// and Exit. Below 720px links collapse into a menu button.

type NavLink = { id: string; label: string; href: string }

type TopNavProps = {
  brand: ReactNode
  links: readonly NavLink[]
  /** id of the current link. */
  current?: string
  /** Language segmented control. */
  language?: ReactNode
  signIn: { label: string; href: string }
  cta: { label: string; onPress: () => void }
  /** Accessible name of the nav landmark. */
  label: string
  /** Mobile menu. */
  menu?: { label: string; open: boolean; onToggle: () => void }
}

function TopNav({ brand, links, current, language, signIn, cta, label, menu }: TopNavProps) {
  return (
    <Box
      tag="nav"
      aria-label={label}
      sticky
      top={0}
      zIndex={40}
      height={60}
      backgroundColor={tokens['surface.glass']}
      borderBottomWidth={1}
      borderStyle="solid"
      borderBottomColor={tokens['border.default']}
    >
      <Box display="flex" alignItems="center" gap={24} height="100%" maxWidth={1200} marginHorizontal="auto" paddingHorizontal={32}>
        {brand}
        <Box display="flex" alignItems="center" gap={4} flexGrow={1}>
          {links.map((link) => (
            <Text
              key={link.id}
              tag="a"
              href={link.href}
              aria-current={link.id === current ? 'page' : undefined}
              paddingVertical={6}
              paddingHorizontal={10}
              borderRadius={6}
              fontSize={14}
              textDecoration="none"
              color={link.id === current ? tokens['text.primary'] : tokens['text.secondary']}
              hoverStyle={{ backgroundColor: tokens['surface.hover'], color: tokens['text.primary'] }}
            >
              {link.label}
            </Text>
          ))}
        </Box>
        {language}
        <Text tag="a" href={signIn.href} fontSize={14} textDecoration="none" color={tokens['text.secondary']} hoverStyle={{ color: tokens['text.primary'] }}>
          {signIn.label}
        </Text>
        <Button variant="primary" size="web" onPress={cta.onPress}>
          {cta.label}
        </Button>
        {menu && (
          <IconButton label={menu.label} size="lg" aria-expanded={menu.open} onPress={menu.onToggle}>
            <Icon name={menu.open ? 'x' : 'more'} size={18} />
          </IconButton>
        )}
      </Box>
    </Box>
  )
}

type AuthHeaderProps = {
  brand?: ReactNode
  language?: ReactNode
  /** Desktop sign-in window: a 44px drag bar with the system controls slot on the left and the language on the right; no brand. */
  desktop?: { controls: ReactNode }
}

function AuthHeader({ brand, language, desktop }: AuthHeaderProps) {
  if (desktop) {
    return (
      <Box tag="header" dragRegion display="flex" alignItems="center" gap={12} height={44} paddingHorizontal={16} flexShrink={0}>
        {desktop.controls}
        <Box flexGrow={1} />
        {language}
      </Box>
    )
  }
  return (
    <Box tag="header" display="flex" alignItems="center" justifyContent="space-between" height={64} paddingHorizontal={32}>
      {brand}
      {language}
    </Box>
  )
}

type WizardHeaderProps = {
  brand: ReactNode
  stepper: ReactNode
  /** Without it (the last step) there is nothing left to leave. */
  exit?: { label: string; onPress: () => void }
}

function WizardHeader({ brand, stepper, exit }: WizardHeaderProps) {
  return (
    <Box tag="header" display="flex" alignItems="center" gap={16} height={60} paddingHorizontal={32} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex">
        {brand}
      </Box>
      {stepper}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" justifyContent="flex-end">
        {exit && (
          <Button variant="ghost" onPress={exit.onPress}>
            {exit.label}
          </Button>
        )}
      </Box>
    </Box>
  )
}

export { TopNav, AuthHeader, WizardHeader }
export type { TopNavProps, AuthHeaderProps, WizardHeaderProps, NavLink }
