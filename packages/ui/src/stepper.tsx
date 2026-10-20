import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'

// Shows the onboarding wizard step. Pending steps keep a neutral ring; the
// current one is an accent circle. A completed style is not defined in the
// approved design, so earlier steps render as pending.

type StepperStep = { id: string; label: string }

type StepperProps = {
  steps: readonly StepperStep[]
  /** id of the current step. */
  current: string
  /** Accessible name of the list. */
  label: string
  /** Hides the labels (narrow screens). */
  compact?: boolean
}

function Stepper({ steps, current, label, compact }: StepperProps) {
  return (
    <Box tag="ol" aria-label={label} display="flex" alignItems="center" gap={8} margin={0} padding={0} listStyle="none">
      {steps.map((step, index) => {
        const active = step.id === current
        return (
          <Box key={step.id} tag="li" display="flex" alignItems="center" gap={8} aria-current={active ? 'step' : undefined}>
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
              borderColor={active ? tokens['accent.default'] : tokens['border.strong']}
              backgroundColor={active ? tokens['accent.default'] : 'transparent'}
            >
              <Text font="mono" fontSize={11} color={active ? tokens['text.onAccent'] : tokens['text.tertiary']}>
                {index + 1}
              </Text>
            </Box>
            {!compact && (
              <Text fontSize={13} fontWeight={active ? 500 : 400} color={active ? tokens['text.primary'] : tokens['text.tertiary']}>
                {step.label}
              </Text>
            )}
            {index < steps.length - 1 && <Box aria-hidden width={28} height={1} backgroundColor={tokens['border.strong']} />}
          </Box>
        )
      })}
    </Box>
  )
}

export { Stepper }
export type { StepperProps, StepperStep }
