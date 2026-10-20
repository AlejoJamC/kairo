import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Callout } from './callout'
import { ConfidenceRing } from './confidence-ring'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { Skeleton } from './loading'
import { px } from './lib/units'

// Decisions and evidence: the typed trace of the AI classification. It never
// shows generated reasoning prose, only the typed decision per row.

type EvidenceRow = {
  id: string
  key: string
  value: string
  sub?: string
  /** The row is the routing decision (accent arrow instead of a check). */
  routing?: boolean
  /** Confidence of this decision, 0 to 1. */
  confidence?: number | null
  /** Actions of this decision (for example Accept and Reject), under its row. */
  actions?: ReactNode
}

type EvidencePanelProps = {
  title: string
  /** Confidence of the whole classification; null renders the no-value ring, undefined hides the ring. */
  confidence?: number | null
  confidenceLabel: string
  /** One-line decision summary in the header. */
  summary?: string
  rows: readonly EvidenceRow[]
  expanded: boolean
  onToggle: () => void
  loading?: boolean
  error?: { message: string; retryLabel: string; onRetry: () => void }
  /** Footer line: the engine name and the mono note. */
  footer: { engine: string; note: string }
  /** Optional footer actions (Wrong classification?, Reject, Confirm). */
  actions?: ReactNode
}

function EvidencePanel({ title, confidence, confidenceLabel, summary, rows, expanded, onToggle, loading, error, footer, actions }: EvidencePanelProps) {
  return (
    <Box
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.card'])}
      backgroundColor={tokens['surface.panel']}
      overflow="hidden"
    >
      <Pressable
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        display="flex"
        alignItems="center"
        gap={8}
        width="100%"
        paddingVertical={10}
        paddingHorizontal={12}
        textAlign="left"
      >
        <Icon name="spark" size={14} color={tokens['accent.ink']} />
        <Text fontSize={13} fontWeight={600} color={tokens['text.primary']}>
          {title}
        </Text>
        {confidence !== undefined && <ConfidenceRing value={loading ? null : confidence} label={confidenceLabel} size={14} />}
        {summary && !loading && (
          <Text flexGrow={1} flexShrink={1} fontSize={12} color={tokens['text.secondary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {summary}
          </Text>
        )}
        <Box flexGrow={1} />
        <Icon name={expanded ? 'up' : 'down'} size={12} color={tokens['text.tertiary']} />
      </Pressable>
      {expanded && (
        <Box paddingHorizontal={12} paddingBottom={10}>
          {error ? (
            <Callout tone="error" actionLabel={error.retryLabel} onAction={error.onRetry}>
              {error.message}
            </Callout>
          ) : loading ? (
            <Box display="flex" flexDirection="column" gap={10} paddingVertical={4}>
              {(['45%', '60%', '50%', '70%'] as const).map((width) => (
                <Skeleton key={width} height={10} width={width} />
              ))}
            </Box>
          ) : (
            rows.map((row) => (
              <Box key={row.id} display="flex" alignItems="flex-start" gap={8} paddingVertical={5}>
                <Box width={18} flexShrink={0} paddingTop={1}>
                  <Icon name={row.routing ? 'right' : 'check'} size={13} color={row.routing ? tokens['accent.ink'] : tokens['color.ok']} />
                </Box>
                <Text width={96} flexShrink={0} fontSize={12} color={tokens['text.tertiary']}>
                  {row.key}
                </Text>
                <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
                  <Text tag="div" display="block" fontSize={12.5} fontWeight={500} color={tokens['text.primary']}>
                    {row.value}
                  </Text>
                  {row.sub && (
                    <Text tag="div" display="block" fontSize={11.5} color={tokens['text.tertiary']}>
                      {row.sub}
                    </Text>
                  )}
                </Box>
                {typeof row.confidence === 'number' && <ConfidenceRing value={row.confidence} variant="numeric" label={confidenceLabel} size={14} />}
                {row.actions && <Box display="flex" gap={6} flexShrink={0}>{row.actions}</Box>}
              </Box>
            ))
          )}
        </Box>
      )}
      <Box display="flex" alignItems="center" gap={8} paddingVertical={8} paddingHorizontal={12} backgroundColor={tokens['surface.sunken']}>
        <Icon name="spark" size={12} color={tokens['accent.ink']} />
        <Text fontSize={11.5} fontWeight={500} color={tokens['accent.ink']}>
          {footer.engine}
        </Text>
        <Text flexGrow={1} font="mono" fontSize={10.5} color={tokens['text.tertiary']}>
          {footer.note}
        </Text>
        {actions}
      </Box>
    </Box>
  )
}

export { EvidencePanel }
export type { EvidencePanelProps, EvidenceRow }
