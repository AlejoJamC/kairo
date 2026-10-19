import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Box, Text } from './layout'
import { px } from './lib/units'

// A connected or available channel in settings. The tile shows the service
// initial (or the provider logo) on the provider color.

type IntegrationStatus = 'connected' | 'available' | 'connecting' | 'error' | 'soon'

type IntegrationCardProps = {
  name: string
  /** Initial shown in the tile when there is no logo. */
  initial: string
  /** Provider color of the tile. */
  tileColor: string
  logo?: ReactNode
  status: IntegrationStatus
  description?: string
  /** Error text, shown instead of the description when the connection is lost. */
  errorMessage?: string
  beta?: boolean
  labels: { beta: string; soon: string; connect: string; connecting: string; reconnect: string; disconnect?: string }
  onConnect?: () => void
  onReconnect?: () => void
  onDisconnect?: () => void
}

function dotColor(status: IntegrationStatus): string | null {
  if (status === 'connected') return tokens['color.ok']
  if (status === 'error') return tokens['color.bad']
  if (status === 'connecting') return tokens['color.warn']
  return null
}

function IntegrationCard({ name, initial, tileColor, logo, status, description, errorMessage, beta, labels, onConnect, onReconnect, onDisconnect }: IntegrationCardProps) {
  const dot = dotColor(status)
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={12}
      minHeight={84}
      padding={14}
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.card'])}
      backgroundColor={tokens['surface.panel']}
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        width={40}
        height={40}
        flexShrink={0}
        borderRadius={px(tokens['radius.row'])}
        backgroundColor={tileColor}
        opacity={status === 'soon' ? 0.5 : 1}
      >
        {logo ?? (
          <Text fontSize={16} fontWeight={600} color={tokens['text.onAccent']}>
            {initial}
          </Text>
        )}
      </Box>
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
        <Box display="flex" alignItems="center" gap={6}>
          <Text fontSize={14} fontWeight={600} color={tokens['text.primary']}>
            {name}
          </Text>
          {dot && <Box width={7} height={7} circle backgroundColor={dot} pulse={status === 'connecting'} />}
          {beta && (
            <Text font="mono" fontSize={9.5} fontWeight={600} paddingVertical={1} paddingHorizontal={5} borderRadius={4} backgroundColor={tokens['surface.hover']} color={tokens['text.tertiary']}>
              {labels.beta}
            </Text>
          )}
        </Box>
        {(status === 'error' ? errorMessage : description) && (
          <Text tag="div" display="block" marginTop={2} fontSize={12} color={status === 'error' ? tokens['color.bad-ink'] : tokens['text.tertiary']}>
            {status === 'error' ? errorMessage : description}
          </Text>
        )}
      </Box>
      {status === 'soon' ? (
        <Text fontSize={12} color={tokens['text.tertiary']}>
          {labels.soon}
        </Text>
      ) : status === 'connecting' ? (
        <Button disabled loading>
          {labels.connecting}
        </Button>
      ) : status === 'error' ? (
        <Button variant="primary" onPress={onReconnect}>
          {labels.reconnect}
        </Button>
      ) : status === 'available' ? (
        <Button onPress={onConnect}>{labels.connect}</Button>
      ) : labels.disconnect ? (
        <Button variant="ghost" onPress={onDisconnect}>
          {labels.disconnect}
        </Button>
      ) : null}
    </Box>
  )
}

export { IntegrationCard }
export type { IntegrationCardProps, IntegrationStatus }
