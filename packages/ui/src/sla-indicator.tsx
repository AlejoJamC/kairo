import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { VisuallyHidden } from './lib/visually-hidden'

// The first-response SLA of a ticket: compact for a queue row, full for the
// ticket heading. Four states follow the thresholds of the SLA policy.

type SlaStatus = 'onTime' | 'atRisk' | 'escalating' | 'overdue'

const TEXT: Record<SlaStatus, { compact: string; full: string }> = {
  onTime: { compact: tokens['text.tertiary'], full: tokens['text.secondary'] },
  atRisk: { compact: tokens['sla.atRiskText'], full: tokens['sla.atRiskText'] },
  escalating: { compact: tokens['sla.escalationText'], full: tokens['sla.escalationText'] },
  overdue: { compact: tokens['sla.overdueText'], full: tokens['sla.overdueText'] },
}

const BAR: Record<SlaStatus, string> = {
  onTime: tokens['sla.onTime'],
  atRisk: tokens['sla.atRisk'],
  escalating: tokens['sla.escalation'],
  overdue: tokens['sla.overdueBar'],
}

type SlaIndicatorProps =
  | {
      variant: 'compact'
      /** Mono time: "in 40m" while it counts down, "153d" once overdue. */
      time: string
      /** Full phrase of the state, for the tooltip and screen readers. */
      title: string
      status?: SlaStatus
    }
  | {
      variant: 'full'
      /** For example "SLA overdue by 30m". */
      label: string
      /** Secondary note after the phrase ("no first response"). */
      note?: string
      /** 0 to 1: how much of the maximum has elapsed; full when overdue. */
      progress?: number
      status?: SlaStatus
    }

function SlaIndicator(props: SlaIndicatorProps) {
  const status = props.status ?? 'overdue'
  if (props.variant === 'compact') {
    const color = TEXT[status].compact
    return (
      <Box tag="span" display="inline-flex" alignItems="center" gap={4} title={props.title}>
        <Icon name="clock" size={12} color={color} />
        <Text font="mono" fontSize={11} color={color}>
          {props.time}
        </Text>
        <VisuallyHidden>{props.title}</VisuallyHidden>
      </Box>
    )
  }
  const color = TEXT[status].full
  return (
    <Box display="flex" flexWrap="wrap" alignItems="center" gap={10}>
      <Box display="inline-flex" alignItems="center" gap={6}>
        <Icon name="clock" size={14} color={color} />
        <Text fontSize={12.5} fontWeight={500} color={color}>
          {props.label}
        </Text>
      </Box>
      {props.note && (
        <Text fontSize={12.5} color={tokens['text.tertiary']}>
          {props.note}
        </Text>
      )}
      {props.progress !== undefined && (
        <Box width={120} height={4} borderRadius={999} backgroundColor={tokens['sla.track']} overflowX="hidden" overflowY="hidden" aria-hidden>
          <Box height={4} width={`${Math.round(Math.max(0, Math.min(1, props.progress)) * 100)}%` as never} backgroundColor={BAR[status]} />
        </Box>
      )}
    </Box>
  )
}

export { SlaIndicator }
export type { SlaIndicatorProps, SlaStatus }
