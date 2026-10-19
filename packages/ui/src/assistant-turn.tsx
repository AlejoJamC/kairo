import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Callout } from './callout'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { ReasoningSteps, type ProgressStep, type ReasoningPhase } from './progress-steps'

// The Kairo Assistant conversation in the context panel: the empty state, the
// agent's question and the assistant's answer. The answer body, draft card,
// sources and follow-ups are slots, so every answer type shares one frame.

const GRADIENT = `linear-gradient(135deg, ${tokens['accent.default']}, ${tokens['color.accent-indigo']})`

type AssistantMarkProps = { size?: number }

/** The assistant's tile: the spark on the accent gradient with a soft glow. */
function AssistantMark({ size = 24 }: AssistantMarkProps) {
  return (
    <Box
      width={size}
      height={size}
      borderRadius={7}
      flexShrink={0}
      backgroundImage={GRADIENT}
      display="flex"
      alignItems="center"
      justifyContent="center"
      boxShadow={tokens['shadow.glow']}
    >
      <Icon name="spark" size={size * 0.56} color={tokens['text.onAccent']} />
    </Box>
  )
}

type AssistantEmptyProps = {
  name: string
  tagline: string
  intro: string
  /** Starter suggestions (PromptStarters). */
  children?: ReactNode
}

function AssistantEmpty({ name, tagline, intro, children }: AssistantEmptyProps) {
  return (
    <Box paddingTop={22} paddingHorizontal={16} paddingBottom={8} display="flex" flexDirection="column">
      <Box display="flex" alignItems="center" gap={10} marginBottom={12}>
        <AssistantMark size={34} />
        <Box>
          <Text tag="div" display="block" fontSize={15} fontWeight={600} letterSpacing={-0.15} color={tokens['text.primary']}>
            {name}
          </Text>
          <Text tag="div" display="block" fontSize={12} color={tokens['text.tertiary']}>
            {tagline}
          </Text>
        </Box>
      </Box>
      <Text tag="p" display="block" margin={0} marginBottom={18} fontSize={13.5} lineHeight={21.6} color={tokens['text.secondary']}>
        {intro}
      </Text>
      {children}
    </Box>
  )
}

function UserTurn({ children }: { children: ReactNode }) {
  return (
    <Box display="flex" justifyContent="flex-end" marginBottom={18}>
      <Text
        tag="div"
        display="block"
        maxWidth="85%"
        paddingVertical={8}
        paddingHorizontal={12}
        borderTopLeftRadius={12}
        borderTopRightRadius={12}
        borderBottomRightRadius={4}
        borderBottomLeftRadius={12}
        backgroundColor={tokens['surface.hover']}
        color={tokens['text.primary']}
        fontSize={13.5}
        lineHeight={20.25}
      >
        {children}
      </Text>
    </Box>
  )
}

type AssistantTurnProps = {
  steps: readonly ProgressStep[]
  phase: ReasoningPhase
  stepsLabels: { thinking: string; writing: string; done: string }
  /** The answer text blocks. */
  children?: ReactNode
  /** Draft card for draft answers. Shown when the answer is done. */
  draft?: ReactNode
  /** SourceList. Shown when the answer is done. */
  sources?: ReactNode
  /** FollowUps. Shown when the answer is done. */
  followUps?: ReactNode
  /** The answer failed: a callout with Retry replaces the answer. */
  error?: { message: string; retryLabel: string; onRetry: () => void }
}

function AssistantTurn({ steps, phase, stepsLabels, children, draft, sources, followUps, error }: AssistantTurnProps) {
  const done = phase === 'done' && !error
  return (
    <Box display="flex" gap={9} marginBottom={20}>
      <AssistantMark size={24} />
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} paddingTop={1}>
        <ReasoningSteps steps={steps} phase={phase} labels={stepsLabels} />
        {error ? (
          <Box display="flex" flexDirection="column" alignItems="flex-start" gap={8}>
            <Callout tone="error">{error.message}</Callout>
            <Button variant="secondary" size="sm" onPress={error.onRetry}>
              {error.retryLabel}
            </Button>
          </Box>
        ) : (
          <>
            {children}
            {done && draft && (
              <Box fadeIn marginTop={2} marginBottom={11}>
                {draft}
              </Box>
            )}
            {done && sources && <Box marginBottom={12}>{sources}</Box>}
            {done && followUps && <Box fadeIn>{followUps}</Box>}
          </>
        )}
      </Box>
    </Box>
  )
}

export { AssistantMark, AssistantEmpty, UserTurn, AssistantTurn }
export type { AssistantMarkProps, AssistantEmptyProps, AssistantTurnProps }
