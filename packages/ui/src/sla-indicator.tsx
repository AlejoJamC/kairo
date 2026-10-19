import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Text } from './layout'

// The SLA state of a ticket (compact for a queue row, full for the ticket
// header) and the SLA scale of a priority in settings.

type SlaIndicatorProps =
  | {
      variant: 'compact'
      /** Mono time, for example "48m". */
      time: string
      title: string
      /** Where the SLA stands; overdue by default. */
      status?: 'onTime' | 'atRisk' | 'overdue'
    }
  | {
      variant: 'full'
      /** For example "SLA overdue by 30m". */
      label: string
      /** True when the first response is still missing. */
      noResponse?: boolean
      /** 0 to 1: how much of the SLA window has elapsed. */
      progress?: number
      /** Where the SLA stands; overdue by default. */
      status?: 'onTime' | 'atRisk' | 'overdue'
    }

function SlaIndicator(props: SlaIndicatorProps) {
  if (props.variant === 'compact') {
    const tone = props.status === 'onTime' ? tokens['color.ok-ink'] : props.status === 'atRisk' ? tokens['color.sla-alert-ink'] : tokens['sla.overdueText']
    return (
      <Box tag="span" display="inline-flex" alignItems="center" gap={4} title={props.title}>
        <Icon name="clock" size={12} color={tone} />
        <Text font="mono" fontSize={11} color={tone}>
          {props.time}
        </Text>
      </Box>
    )
  }
  const muted = props.noResponse
  const status = props.status ?? 'overdue'
  const text = status === 'onTime' ? tokens['color.ok-ink'] : status === 'atRisk' ? tokens['color.sla-alert-ink'] : tokens['sla.overdueText']
  const bar = status === 'onTime' ? tokens['sla.onTime'] : status === 'atRisk' ? tokens['sla.atRisk'] : tokens['sla.overdueBar']
  return (
    <Box display="flex" alignItems="center" gap={8}>
      <Icon name="clock" size={14} color={muted ? tokens['text.tertiary'] : text} />
      <Text fontSize={12.5} fontWeight={500} color={muted ? tokens['text.tertiary'] : text}>
        {props.label}
      </Text>
      {props.progress !== undefined && (
        <Box width={120} height={4} borderRadius={999} backgroundColor={tokens['sla.track']} overflowX="hidden" overflowY="hidden" aria-hidden>
          <Box height={4} width={`${Math.round(Math.max(0, Math.min(1, props.progress)) * 100)}%` as never} backgroundColor={bar} />
        </Box>
      )}
    </Box>
  )
}

type SlaScaleProps = {
  /** Minutes at which a ticket is at risk, escalates and breaches. */
  alert: number
  escalation: number
  maximum: number
  /** Legend labels. */
  labels: { minimum: string; alert: string; escalation: string; breach: string }
  /** Shown in the error color when the values are out of order. */
  orderError?: string
}

function SlaScale({ alert, escalation, maximum, labels, orderError }: SlaScaleProps) {
  const total = Math.max(maximum, 1)
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / total) * 100))}%`
  return (
    <Box>
      <Box display="flex" height={8} borderRadius={999} backgroundColor={tokens['sla.track']} overflowX="hidden" overflowY="hidden" aria-hidden>
        <Box width={pct(alert) as never} backgroundColor={tokens['sla.onTime']} />
        <Box width={pct(escalation - alert) as never} backgroundColor={tokens['sla.atRisk']} />
        <Box width={pct(maximum - escalation) as never} backgroundColor={tokens['sla.escalation']} />
      </Box>
      <Box display="flex" justifyContent="space-between" marginTop={6}>
        {[labels.minimum, labels.alert, labels.escalation, labels.breach].map((text, index) => (
          <Text key={index} font="mono" fontSize={11} color={[tokens['sla.minimumMarker'], tokens['sla.alertLabel'], tokens['sla.escalationLabel'], tokens['sla.breachLabel']][index]}>
            {text}
          </Text>
        ))}
      </Box>
      {orderError && (
        <Text tag="div" display="block" marginTop={6} fontSize={12} color={tokens['color.bad-ink']} role="alert">
          {orderError}
        </Text>
      )}
    </Box>
  )
}

export { SlaIndicator, SlaScale }
export type { SlaIndicatorProps, SlaScaleProps }
