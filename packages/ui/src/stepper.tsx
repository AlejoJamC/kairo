import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { VisuallyHidden } from './lib/visually-hidden'

// Shows where the person is in the onboarding wizard and which steps they have
// completed. It is a progress indicator, not navigation. Steps before the
// current one are completed; later ones are pending.

type StepperStep = { id: string; label: string }

type StepperProps = {
  steps: readonly StepperStep[]
  /** id of the current step. */
  current: string
  /** Accessible name of the list. */
  label: string
  /** Read after the name of a completed step: "done". */
  doneLabel: string
  /** Hides the labels visually (narrow screens); they stay available to screen readers. */
  compact?: boolean
}

function Stepper({ steps, current, label, doneLabel, compact }: StepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === current)
  return (
    <Box tag="ol" aria-label={label} display="flex" alignItems="center" gap={10} margin={0} padding={0} listStyle="none">
      {steps.map((step, index) => {
        const active = index === currentIndex
        const done = index < currentIndex
        const labelColor = active ? tokens['text.primary'] : done ? tokens['text.secondary'] : tokens['text.tertiary']
        return (
          <Box key={step.id} tag="li" display="flex" alignItems="center" gap={10} aria-current={active ? 'step' : undefined}>
            <Box display="flex" alignItems="center" gap={8}>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                width={20}
                height={20}
                circle
                flexShrink={0}
                borderWidth={1}
                borderStyle="solid"
                borderColor={active ? tokens['accent.default'] : done ? tokens['accent.line'] : tokens['border.strong']}
                backgroundColor={active ? tokens['accent.default'] : done ? tokens['accent.soft'] : 'transparent'}
              >
                {done ? (
                  <Icon name="check" size={11} strokeWidth={3} color={tokens['accent.ink']} />
                ) : (
                  <Text font="mono" fontSize={10.5} color={active ? tokens['text.onAccent'] : tokens['text.tertiary']}>
                    {index + 1}
                  </Text>
                )}
              </Box>
              {compact ? (
                <VisuallyHidden>{done ? `${step.label} (${doneLabel})` : step.label}</VisuallyHidden>
              ) : (
                <Text fontSize={12.5} fontWeight={active ? 500 : 400} color={labelColor}>
                  {step.label}
                  {done && <VisuallyHidden> ({doneLabel})</VisuallyHidden>}
                </Text>
              )}
            </Box>
            {index < steps.length - 1 && <Box aria-hidden width={28} height={1} backgroundColor={done ? tokens['accent.line'] : tokens['border.strong']} />}
          </Box>
        )
      })}
    </Box>
  )
}

export { Stepper }
export type { StepperProps, StepperStep }
