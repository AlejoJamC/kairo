import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Callout } from './callout'
import { ConfidenceRing } from './confidence-ring'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { Skeleton } from './loading'
import { PropRow } from './prop-row'
import { px } from './lib/units'

// The AI proposal for a ticket, waiting for the agent to confirm or reject it.
// The agent always has the last word. Missing fields read as a dash.

type ProposalField = { label: string; value: string | null | undefined }

type ProposalState = 'ready' | 'loading' | 'confirming' | 'error'

type AiProposalProps = {
  title: string
  /** Model name in mono. */
  model?: string
  fields: readonly ProposalField[]
  /** 0 to 1; shown as a confidence chip. */
  confidence?: number | null
  confidenceLabel: string
  state?: ProposalState
  /** strip: above the ticket header. compact: a card in the context panel. */
  variant?: 'strip' | 'compact'
  onConfirm: () => void
  onReject: () => void
  onRetry?: () => void
  labels: { confirm: string; reject: string; retry: string; error: string }
  /** Shortcuts carried in the button titles, for example "R" and "⌘↵". */
  shortcuts?: { confirm?: string; reject?: string }
}

function Actions({ state, onConfirm, onReject, onRetry, labels, shortcuts }: Pick<AiProposalProps, 'state' | 'onConfirm' | 'onReject' | 'onRetry' | 'labels' | 'shortcuts'>) {
  const loading = state === 'loading'
  const confirming = state === 'confirming'
  return (
    <Box display="flex" alignItems="center" gap={8} flexShrink={0}>
      {state === 'error' && onRetry && (
        <Button variant="secondary" onPress={onRetry}>
          {labels.retry}
        </Button>
      )}
      <Button variant="secondary" disabled={loading || confirming} shortcut={shortcuts?.reject} onPress={onReject}>
        {labels.reject}
      </Button>
      {state !== 'error' && (
        <Button variant="primary" disabled={loading} loading={state === 'confirming'} shortcut={shortcuts?.confirm} onPress={onConfirm}>
          {labels.confirm}
        </Button>
      )}
    </Box>
  )
}

function FieldChips({ fields, state, labels }: Pick<AiProposalProps, 'fields' | 'state' | 'labels'>) {
  if (state === 'loading') {
    return (
      <Box display="flex" gap={8} flexGrow={1}>
        {[0, 1, 2].map((index) => (
          <Box key={index} borderRadius={999} overflow="hidden">
            <Skeleton height={26} width={92} />
          </Box>
        ))}
      </Box>
    )
  }
  if (state === 'error') {
    return (
      <Box flexGrow={1}>
        <Callout tone="error">{labels.error}</Callout>
      </Box>
    )
  }
  return (
    <Box display="flex" alignItems="center" gap={8} flexWrap="wrap" flexGrow={1}>
      {fields.map((field) => (
        <Box
          key={field.label}
          display="flex"
          alignItems="center"
          gap={6}
          height={26}
          paddingHorizontal={10}
          borderRadius={999}
          borderWidth={1}
          borderStyle="solid"
          borderColor={tokens['border.default']}
          backgroundColor={tokens['surface.panel']}
        >
          <Text fontSize={11.5} color={tokens['text.tertiary']}>
            {field.label}
          </Text>
          <Text fontSize={12} fontWeight={500} color={tokens['text.primary']}>
            {field.value || '—'}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

function AiProposal(props: AiProposalProps) {
  const { title, model, fields, confidence, confidenceLabel, state = 'ready', variant = 'strip', labels } = props
  const ring = <ConfidenceRing value={confidence} label={confidenceLabel} showValue size={14} />

  if (variant === 'compact') {
    return (
      <Box
        borderWidth={1}
        borderStyle="solid"
        borderColor={tokens['accent.line']}
        borderRadius={px(tokens['radius.card'])}
        backgroundColor={tokens['surface.panel']}
        overflow="hidden"
      >
        <Box display="flex" alignItems="center" gap={8} paddingVertical={10} paddingHorizontal={12}>
          <Icon name="spark" size={14} color={tokens['accent.ink']} />
          <Text flexGrow={1} fontSize={13} fontWeight={600} color={tokens['text.primary']}>
            {title}
          </Text>
          {state === 'ready' && ring}
        </Box>
        <Box paddingHorizontal={12} paddingBottom={8}>
          {state === 'loading' && <Skeleton height={10} width="70%" />}
          {state === 'error' && <Callout tone="error">{labels.error}</Callout>}
          {(state === 'ready' || state === 'confirming') &&
            fields.map((field, index) => (
              <PropRow key={field.label} label={field.label} size="sm" last={index === fields.length - 1}>
                {field.value || '—'}
              </PropRow>
            ))}
        </Box>
        <Box display="flex" justifyContent="flex-end" paddingVertical={10} paddingHorizontal={12} backgroundColor={tokens['surface.sunken']}>
          <Actions {...props} />
        </Box>
      </Box>
    )
  }

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={12}
      flexWrap="wrap"
      paddingVertical={10}
      paddingHorizontal={16}
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['accent.line']}
      borderRadius={px(tokens['radius.card'])}
      backgroundColor={tokens['accent.soft']}
    >
      <Box display="flex" alignItems="center" gap={8} flexShrink={0}>
        <Icon name="spark" size={14} color={tokens['accent.ink']} />
        <Text fontSize={13} fontWeight={600} color={tokens['accent.ink']}>
          {title}
        </Text>
        {model && (
          <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
            {model}
          </Text>
        )}
      </Box>
      <FieldChips fields={fields} state={state} labels={labels} />
      {state === 'ready' && ring}
      <Actions {...props} />
    </Box>
  )
}

export { AiProposal }
export type { AiProposalProps, ProposalField, ProposalState }
