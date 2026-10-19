import { tokens } from '@kairo/tokens'
import { useEffect, useState } from 'react'
import { Button } from './button'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { Spinner } from './loading'
import { px } from './lib/units'

// Steps of a process that runs on its own. The wait variant is the public
// hand-off page; the reasoning variant is the compact trace under an assistant
// answer. A failed step stops the list: later steps stay pending.

type StepStatus = 'done' | 'active' | 'pending' | 'failed'

type ProgressStep = {
  id: string
  label: string
  status: StepStatus
  /** Reasoning variant: mono detail after the label. */
  detail?: string
}

type ProgressStepsProps = {
  title: string
  subtitle?: string
  steps: readonly ProgressStep[]
  /** "ready" text of a finished step. */
  doneLabel: string
  /** Primary call to action shown once every step is done. */
  cta?: { label: string; onPress: () => void }
  /** Fallback link under the CTA. */
  fallback?: { label: string; href: string }
  /** Shown instead of the CTA when a step failed. */
  retryLabel?: string
  onRetry?: () => void
}

function StepGlyph({ status }: { status: StepStatus }) {
  if (status === 'done') return <Icon name="check" size={14} color={tokens['color.ok']} />
  if (status === 'failed') return <Icon name="alert" size={14} color={tokens['color.bad-ink']} />
  if (status === 'active') return <Spinner />
  return <Box width={6} height={6} circle backgroundColor={tokens['border.strong']} />
}

function ProgressSteps({ title, subtitle, steps, doneLabel, cta, fallback, retryLabel, onRetry }: ProgressStepsProps) {
  const failed = steps.some((step) => step.status === 'failed')
  const complete = steps.every((step) => step.status === 'done')
  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={20} width="100%">
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        width={48}
        height={48}
        borderRadius={px(tokens['radius.card'])}
        backgroundColor={tokens['accent.default']}
        pulse={!complete && !failed}
      >
        <Icon name="spark" size={22} color={tokens['text.onAccent']} />
      </Box>
      <Box role="status" aria-live="polite" alignItems="center">
        <Text tag="h1" display="block" margin={0} fontSize={22} fontWeight={600} color={tokens['text.primary']}>
          {title}
        </Text>
        {subtitle && (
          <Text tag="p" display="block" margin={0} marginTop={6} fontSize={14} color={tokens['text.secondary']}>
            {subtitle}
          </Text>
        )}
      </Box>
      <Box
        tag="ul"
        margin={0}
        padding={0}
        listStyle="none"
        width="100%"
        maxWidth={440}
        borderWidth={1}
        borderStyle="solid"
        borderColor={tokens['border.default']}
        borderRadius={px(tokens['radius.card'])}
        backgroundColor={tokens['surface.panel']}
        overflow="hidden"
      >
        {steps.map((step, index) => (
          <Box
            key={step.id}
            tag="li"
            display="flex"
            alignItems="center"
            gap={10}
            height={42}
            paddingHorizontal={14}
            borderTopWidth={index === 0 ? 0 : 1}
            borderStyle="solid"
            borderTopColor={tokens['border.default']}
          >
            <StepGlyph status={step.status} />
            <Text
              flexGrow={1}
              fontSize={13.5}
              color={step.status === 'failed' ? tokens['color.bad-ink'] : step.status === 'pending' ? tokens['text.tertiary'] : tokens['text.primary']}
            >
              {step.label}
            </Text>
            {step.status === 'done' && (
              <Text font="mono" fontSize={11} color={tokens['color.ok-ink']}>
                {doneLabel}
              </Text>
            )}
          </Box>
        ))}
      </Box>
      {complete && cta && (
        <Box fadeIn display="flex" flexDirection="column" alignItems="center" gap={10}>
          <Button variant="primary" size="web" onPress={cta.onPress}>
            {cta.label}
          </Button>
          {fallback && (
            <Text tag="a" href={fallback.href} fontSize={13} color={tokens['text.link']}>
              {fallback.label}
            </Text>
          )}
        </Box>
      )}
      {failed && retryLabel && onRetry && (
        <Button variant="primary" size="web" onPress={onRetry}>
          {retryLabel}
        </Button>
      )}
    </Box>
  )
}

type ReasoningPhase = 'thinking' | 'writing' | 'done'

type ReasoningStepsProps = {
  steps: readonly ProgressStep[]
  phase: ReasoningPhase
  /** Controlled open state. Without it the list opens while running and collapses when done. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Trigger text per phase; done reads "Reasoned · N steps". */
  labels: { thinking: string; writing: string; done: string }
}

function dotColor(status: StepStatus): string {
  if (status === 'failed') return tokens['color.bad']
  if (status === 'done') return tokens['color.ok']
  if (status === 'active') return tokens['accent.default']
  return tokens['border.strong']
}

function ReasoningSteps({ steps, phase, open, onOpenChange, labels }: ReasoningStepsProps) {
  const running = phase !== 'done'
  const [manual, setManual] = useState<boolean | null>(null)
  useEffect(() => {
    if (!running) setManual(null)
  }, [running])
  const expanded = running ? true : (open ?? manual ?? false)
  const toggle = () => {
    onOpenChange?.(!expanded)
    if (open === undefined) setManual(!expanded)
  }
  return (
    <Box marginBottom={10}>
      <Pressable
        type="button"
        aria-expanded={expanded}
        onClick={toggle}
        display="flex"
        alignItems="center"
        gap={6}
        paddingVertical={2}
        font="mono"
        fontSize={11.5}
        color={tokens['text.tertiary']}
        hoverStyle={{ color: tokens['text.primary'] }}
      >
        {running ? <Spinner /> : <Icon name="check" size={12} color={tokens['color.ok']} />}
        <Text role="status" aria-live="polite">
          {labels[phase]}
        </Text>
        <Text transform={expanded ? 'rotate(90deg)' : 'none'} transition="transform .15s" display="inline-flex">
          <Icon name="right" size={11} color={tokens['text.tertiary']} />
        </Text>
      </Pressable>
      {expanded && (
        <Box
          marginTop={6}
          marginLeft={5}
          paddingLeft={12}
          borderLeftWidth={1}
          borderStyle="solid"
          borderLeftColor={tokens['border.default']}
          display="flex"
          flexDirection="column"
          gap={7}
        >
          {steps.map((step) => (
            <Box key={step.id} display="flex" alignItems="center" gap={7}>
              <Box width={5} height={5} circle flexShrink={0} backgroundColor={dotColor(step.status)} />
              <Text fontSize={12} color={step.status === 'pending' ? tokens['text.tertiary'] : tokens['text.secondary']}>
                {step.label}
              </Text>
              {step.detail && (
                <Text font="mono" fontSize={10.5} color={tokens['text.tertiary']}>
                  {step.detail}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

export { ProgressSteps, ReasoningSteps }
export type { ProgressStep, ProgressStepsProps, ReasoningStepsProps, ReasoningPhase, StepStatus }
