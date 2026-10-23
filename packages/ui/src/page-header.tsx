import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Callout } from './callout'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { PlainInput } from './plain'
import { VisuallyHidden } from './lib/visually-hidden'
import { px } from './lib/units'
import { useWindowChrome } from './window-chrome'

// Header and frame of the app page views (Clients, Knowledge and every
// Settings section): the counterpart of queue-header for views that are not
// queues. The frame, the header, the toolbar and the form footer.

type PageFrameProps = {
  /** Settings and the article editor: the narrow frame. */
  narrow?: boolean
  children: ReactNode
}

function PageFrame({ narrow, children }: PageFrameProps) {
  const macosWindow = useWindowChrome()
  return (
    <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} minHeight={0} scroll backgroundColor={tokens['surface.page']}>
      {macosWindow && <Box dragRegion height={14} />}
      <Box
        display="flex"
        flexDirection="column"
        gap={narrow ? 20 : 22}
        maxWidth={px(tokens[narrow ? 'layout.settings' : 'layout.page'])}
        paddingTop={narrow ? 36 : 32}
        paddingHorizontal={narrow ? 44 : 36}
        paddingBottom={narrow ? 56 : 48}
      >
        {children}
      </Box>
    </Box>
  )
}

type PageHeaderProps = {
  title: string
  /** Total shown next to the title; null while there is no data (shows a dash). */
  count?: number | null
  /** Screen reader text with the unit ("6 clients"). */
  countLabel?: string
  description?: string
  /** The single main action of the view (a primary button of size lg). */
  action?: ReactNode
}

function PageHeader({ title, count, countLabel, description, action }: PageHeaderProps) {
  return (
    <Box display="flex" alignItems="flex-start" gap={16}>
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
        <Box display="flex" alignItems="baseline" gap={10}>
          <Text tag="h1" margin={0} fontSize={26} fontWeight={600} lineHeightRatio={1.2} letterSpacing={-0.52} color={tokens['text.primary']}>
            {title}
          </Text>
          {count !== undefined && (
            <Text font="mono" fontSize={13} color={tokens['text.tertiary']}>
              {count === null ? '—' : count}
              {countLabel && <VisuallyHidden>{countLabel}</VisuallyHidden>}
            </Text>
          )}
        </Box>
        {description && (
          <Text tag="p" display="block" margin={0} marginTop={6} fontSize={13} lineHeightRatio={1.5} color={tokens['text.tertiary']}>
            {description}
          </Text>
        )}
      </Box>
      {action}
    </Box>
  )
}

function PageToolbar({ children }: { children: ReactNode }) {
  return (
    <Box display="flex" flexWrap="wrap" alignItems="center" gap={8}>
      {children}
    </Box>
  )
}

type PageSearchProps = {
  /** Visually hidden label ("Search clients"). */
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function PageSearch({ label, value, onChange, placeholder }: PageSearchProps) {
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={8}
      height={px(tokens['size.control-lg'])}
      width="min(420px, 100%)"
      minWidth={240}
      paddingHorizontal={11}
      borderRadius={px(tokens['radius.field'])}
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      backgroundColor={tokens['surface.panel']}
      focusWithinStyle={{ borderColor: tokens['accent.line'], boxShadow: `0 0 0 3px ${tokens['accent.soft']}` }}
    >
      <Icon name="search" size={13} color={tokens['text.tertiary']} />
      <PlainInput
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        flexGrow={1}
        borderWidth={0}
        backgroundColor="transparent"
        fontSize={12.5}
        color={tokens['text.primary']}
        outlineWidth={0}
      />
    </Box>
  )
}

type PageFormFooterProps = {
  onDiscard: () => void
  onSave: () => void
  /** Disabled while there are no changes. */
  canSave: boolean
  saving?: boolean
  /** The save failed: callout above the footer. */
  error?: string
  labels: { discard: string; save: string }
}

function PageFormFooter({ onDiscard, onSave, canSave, saving, error, labels }: PageFormFooterProps) {
  return (
    <>
      {error && <Callout tone="error">{error}</Callout>}
      <Box display="flex" justifyContent="flex-end" gap={8} paddingTop={14} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
        <Button size="lg" paddingHorizontal={14} onPress={onDiscard}>
          {labels.discard}
        </Button>
        <Button variant="primary" size="lg" paddingHorizontal={16} disabled={!canSave} loading={saving} onPress={onSave}>
          {labels.save}
        </Button>
      </Box>
    </>
  )
}

type SettingsNavProps = {
  /** Accessible name and visible header ("Settings"). */
  title: string
  children: ReactNode
}

/** Column of the Settings sub-navigation: nav-item entries of the settings variant. */
function SettingsNav({ title, children }: SettingsNavProps) {
  return (
    <Box
      tag="nav"
      aria-label={title}
      display="flex"
      flexDirection="column"
      gap={2}
      flexShrink={0}
      width={px(tokens['layout.settings-nav'])}
      paddingVertical={24}
      paddingHorizontal={12}
      borderRightWidth={1}
      borderStyle="solid"
      borderRightColor={tokens['border.default']}
      backgroundColor={tokens['surface.panel']}
    >
      <Text tag="div" display="block" paddingBottom={6} paddingHorizontal={10} font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']}>
        {title}
      </Text>
      {children}
    </Box>
  )
}

export { PageFormFooter, PageFrame, PageHeader, PageSearch, PageToolbar, SettingsNav }
export type { PageFormFooterProps, PageFrameProps, PageHeaderProps, PageSearchProps, SettingsNavProps }
