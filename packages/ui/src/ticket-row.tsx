import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { ConfidenceRing } from './confidence-ring'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { PriorityGlyph } from './priority-glyph'
import { SentimentFace, type Sentiment } from './sentiment-face'

// One ticket in the queue: two or three lines. Line 1 is the priority, the id,
// the subject and the age; line 2 is the sentiment, the sender and the small
// signals; line 3 is optional (a last reply, a similar ticket). The order of
// the signals is fixed and every signal carries a title.

type TicketRowProps = {
  /** Mono id, for example KAI-101. */
  code: string
  subject: string
  priority?: string | null
  escalated?: boolean
  /** Mono age, for example "12m". */
  age: string
  sentiment?: Sentiment | null
  sentimentLabel?: string
  sender: string
  /** An unread mention of you in the ticket's notes. */
  mention?: { label: string }
  /** Internal notes on the ticket. */
  notes?: { count: number; label: string }
  /** Compact SLA (a SlaIndicator or a badge). */
  sla?: ReactNode
  messageCount?: { count: number; label: string }
  confidence?: number | null
  confidenceLabel?: string
  /** Classification failed: an alert icon with this title. */
  failedLabel?: string
  /** Third line: the last reply with a follow-up link, or a similar-ticket tag. */
  footer?: ReactNode
  /** Extra tags after the signals (corrected, group count). */
  extras?: ReactNode
  /** Leading control, for example a selection checkbox. */
  leading?: ReactNode
  selected?: boolean
  /** The row is dimmed (spam). */
  muted?: boolean
  onPress: () => void
  /** Accessible name: "[ID] [subject]". */
  ariaLabel?: string
}

function TicketRow({
  code,
  subject,
  priority,
  escalated,
  age,
  sentiment,
  sentimentLabel,
  sender,
  mention,
  notes,
  sla,
  messageCount,
  confidence,
  confidenceLabel = 'Confidence',
  failedLabel,
  footer,
  extras,
  leading,
  selected,
  muted,
  onPress,
  ariaLabel,
}: TicketRowProps) {
  return (
    <Pressable
      aria-label={ariaLabel ?? `${code} ${subject}`}
      aria-selected={selected}
      onClick={onPress}
      display="flex"
      flexDirection="column"
      gap={5}
      width="100%"
      padding={12}
      borderRadius={9}
      borderWidth={1}
      borderStyle="solid"
      borderColor={selected ? tokens['accent.line'] : 'transparent'}
      backgroundColor={selected ? tokens['accent.soft'] : 'transparent'}
      hoverStyle={selected ? undefined : { backgroundColor: tokens['surface.hover'] }}
      opacity={muted ? 0.55 : 1}
      textAlign="left"
    >
      <Box display="flex" alignItems="center" gap={8}>
        {leading}
        {priority && <PriorityGlyph priority={priority} size={12} />}
        <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
          {code}
        </Text>
        <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={13} fontWeight={500} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {subject}
        </Text>
        {escalated && <Icon name="escalate" size={12} color={tokens['status.escalated']} />}
        <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
          {age}
        </Text>
      </Box>
      <Box display="flex" alignItems="center" gap={8} paddingLeft={22} minHeight={18}>
        {sentiment && <SentimentFace sentiment={sentiment} variant="emoji" label={sentimentLabel ?? sentiment} />}
        <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12} color={tokens['text.secondary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {sender}
        </Text>
        {mention && <Box width={6} height={6} borderRadius={999} backgroundColor={tokens['mentions.unreadDot']} title={mention.label} aria-label={mention.label} role="img" />}
        {notes && notes.count > 0 && (
          <Text display="inline-flex" alignItems="center" gap={3} font="mono" fontSize={10} paddingHorizontal={5} borderRadius={4} backgroundColor={tokens['notes.background']} color={tokens['notes.label']} title={notes.label}>
            <Icon name="lock" size={9} />
            {notes.count}
          </Text>
        )}
        {sla}
        {messageCount && messageCount.count > 1 && (
          <Text font="mono" fontSize={10} color={tokens['text.tertiary']} title={messageCount.label}>
            {messageCount.count}
          </Text>
        )}
        {failedLabel ? (
          <Icon name="alert" size={12} color={tokens['color.bad-ink']} label={failedLabel} />
        ) : (
          confidence !== undefined && <ConfidenceRing variant="numeric" value={confidence} label={confidenceLabel} />
        )}
        {extras}
      </Box>
      {footer && <Box paddingLeft={22}>{footer}</Box>}
    </Pressable>
  )
}

export { TicketRow }
export type { TicketRowProps }
