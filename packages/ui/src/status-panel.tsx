import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Icon, type IconName } from './icon'
import { Box, Text } from './layout'
import { px } from './lib/units'

// A single-action status card: authentication errors and expired invitations.
// The error variant announces itself as an alert and carries the error code.

type StatusPanelProps = {
  title: string
  description: string
  /** neutral: centered, one secondary action. error: alert icon and code footer. */
  tone?: 'neutral' | 'error'
  icon?: IconName
  action: { label: string; onPress: () => void }
  /** Back-to-home link (error variant). */
  secondary?: { label: string; onPress: () => void }
  /** Error variant: mono code and the support action. */
  errorCode?: string
  support?: ReactNode
}

function StatusPanel({ title, description, tone = 'neutral', icon, action, secondary, errorCode, support }: StatusPanelProps) {
  const error = tone === 'error'
  return (
    <Box
      role={error ? 'alert' : undefined}
      width="100%"
      maxWidth={440}
      overflow="hidden"
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.card'])}
      backgroundColor={tokens['surface.panel']}
      boxShadow={tokens['shadow.pop']}
    >
      <Box padding={28} alignItems={error ? 'flex-start' : 'center'}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          width={44}
          height={44}
          marginBottom={16}
          marginHorizontal={error ? 0 : 'auto'}
          borderRadius={px(tokens['radius.row'])}
          backgroundColor={error ? tokens['color.bad-soft'] : tokens['surface.hover']}
        >
          <Icon name={icon ?? (error ? 'alert' : 'clock')} size={20} color={error ? tokens['color.bad-ink'] : tokens['text.secondary']} />
        </Box>
        <Text tag="h1" display="block" margin={0} fontSize={22} fontWeight={600} color={tokens['text.primary']}>
          {title}
        </Text>
        <Text tag="p" display="block" margin={0} marginTop={8} fontSize={14} lineHeightRatio={1.55} color={tokens['text.secondary']}>
          {description}
        </Text>
        <Box display="flex" alignItems="center" justifyContent={error ? 'flex-start' : 'center'} gap={10} marginTop={20}>
          <Button variant={error ? 'primary' : 'secondary'} size="web" onPress={action.onPress}>
            {action.label}
          </Button>
          {secondary && (
            <Button variant="ghost" size="web" onPress={secondary.onPress}>
              {secondary.label}
            </Button>
          )}
        </Box>
      </Box>
      {error && (errorCode || support) && (
        <Box display="flex" alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={28} backgroundColor={tokens['surface.sunken']}>
          {errorCode && (
            <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
              {errorCode}
            </Text>
          )}
          {support}
        </Box>
      )}
    </Box>
  )
}

export { StatusPanel }
export type { StatusPanelProps }
