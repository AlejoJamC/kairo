import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Badge } from './badge'
import { IconButton } from './button'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { VisuallyHidden } from './lib/visually-hidden'
import { px } from './lib/units'
import { useWindowChrome } from './window-chrome'

// Top bar of the ticket: where the agent is, the position in the queue and the
// ticket status. Single line; the breadcrumb truncates before the status.

type TicketBarProps = {
  /** Name of the current queue ("Triage"). */
  queueName: string
  /** Ticket id ("KAI-106"). */
  ticketId: string
  /** Position in the visible queue; hidden when there is none. */
  position?: { index: number; total: number }
  /** The ticket has internal notes: team badge that opens the Notes tab. */
  notes?: { count: number; label: string; ariaLabel: string; onOpen: () => void }
  /** The ticket is escalated: the escalated pill ("ESCALATED"). */
  escalatedLabel?: string
  /** status-chip with its menu, or the static read-only chip. */
  status?: ReactNode
  onPrevious?: () => void
  onNext?: () => void
  /** Previous on the first row and Next on the last row are disabled. */
  hasPrevious?: boolean
  hasNext?: boolean
  labels: {
    /** Accessible name of the breadcrumb ("Path"). */
    path: string
    /** "Ticket 1 of 6". */
    position: string
    previous: string
    next: string
  }
}

function TicketBar({ queueName, ticketId, position, notes, escalatedLabel, status, onPrevious, onNext, hasPrevious = true, hasNext = true, labels }: TicketBarProps) {
  const macosWindow = useWindowChrome()
  return (
    <Box
      tag="header"
      dragRegion={macosWindow}
      display="flex"
      alignItems="center"
      gap={8}
      height={px(tokens['size.header'])}
      flexShrink={0}
      paddingLeft={24}
      paddingRight={12}
      borderBottomWidth={1}
      borderStyle="solid"
      borderBottomColor={tokens['border.default']}
      backgroundColor={tokens['surface.page']}
      position="relative"
      zIndex={10}
    >
      <Box tag="nav" aria-label={labels.path} display="flex" alignItems="center" gap={8} minWidth={0}>
        <Text fontSize={12.5} color={tokens['text.tertiary']} overflow="hidden" textOverflow="ellipsis" minWidth={0}>
          {queueName}
        </Text>
        <Icon name="right" size={12} color={tokens['text.tertiary']} />
        <Text aria-current="page" font="mono" fontSize={12} fontWeight={500} color={tokens['text.primary']} flexShrink={0}>
          {ticketId}
        </Text>
      </Box>
      {position && (
        <Text font="mono" fontSize={11} color={tokens['text.tertiary']} marginLeft={4} flexShrink={0}>
          <span aria-hidden>
            {position.index} / {position.total}
          </span>
          <VisuallyHidden>{labels.position}</VisuallyHidden>
        </Text>
      )}
      {notes && (
        <Badge variant="team" alignSelf="center" icon={<Icon name="lock" size={9} />} onPress={notes.onOpen} aria-label={notes.ariaLabel}>
          {notes.label}
        </Badge>
      )}
      {escalatedLabel && (
        <Badge variant="escalated" alignSelf="center" icon={<Icon name="escalate" size={9} color={tokens['escalation.text']} />}>
          {escalatedLabel}
        </Badge>
      )}
      <Box flexGrow={1} />
      {status}
      <Box display="flex" gap={2} marginLeft={4}>
        <IconButton label={labels.previous} shortcut="K" disabled={!hasPrevious} onPress={onPrevious}>
          <Icon name="up" size={15} color={tokens['text.tertiary']} />
        </IconButton>
        <IconButton label={labels.next} shortcut="J" disabled={!hasNext} onPress={onNext}>
          <Icon name="down" size={15} color={tokens['text.tertiary']} />
        </IconButton>
      </Box>
    </Box>
  )
}

export { TicketBar }
export type { TicketBarProps }
