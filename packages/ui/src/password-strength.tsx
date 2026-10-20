import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Text } from './layout'

// Strength of a password as four bars and a mono label, with the list of
// requirements. A met requirement shows a check; a pending one a dot; a failed
// match an x.

type Requirement = {
  label: string
  met: boolean
  /** The requirement is violated (for example the confirmation differs). */
  failed?: boolean
}

type PasswordStrengthProps = {
  /** 0 (nothing typed) to 4. */
  score: 0 | 1 | 2 | 3 | 4
  /** Word for the score: —, weak, fair, good, strong. */
  scoreLabel: string
  requirements: readonly Requirement[]
  /** id of the element listing the requirements, for aria-describedby on the field. */
  id?: string
}

function barColor(score: number, index: number): string {
  if (index >= score) return tokens['border.strong']
  if (score === 1) return tokens['color.bad']
  if (score === 2) return tokens['color.warn']
  return tokens['color.ok']
}

function PasswordStrength({ score, scoreLabel, requirements, id }: PasswordStrengthProps) {
  return (
    <Box id={id}>
      <Box display="flex" alignItems="center" gap={8}>
        <Box display="flex" gap={4} flexGrow={1} flexShrink={1} flexBasis="0%" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} flexGrow={1} flexShrink={1} flexBasis="0%" height={4} borderRadius={999} backgroundColor={barColor(score, i)} />
          ))}
        </Box>
        <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
          {scoreLabel}
        </Text>
      </Box>
      <Box tag="ul" marginTop={10} display="flex" flexDirection="column" gap={6}>
        {requirements.map((requirement) => (
          <Box tag="li" key={requirement.label} display="flex" alignItems="center" gap={8}>
            {requirement.failed ? (
              <Icon name="x" size={13} color={tokens['color.bad-ink']} />
            ) : requirement.met ? (
              <Icon name="check" size={13} color={tokens['color.ok']} />
            ) : (
              <Box width={13} height={13} display="flex" alignItems="center" justifyContent="center">
                <Box width={5} height={5} borderRadius={999} backgroundColor={tokens['text.tertiary']} />
              </Box>
            )}
            <Text fontSize={12.5} color={requirement.failed ? tokens['color.bad-ink'] : requirement.met ? tokens['text.primary'] : tokens['text.tertiary']}>
              {requirement.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export { PasswordStrength }
export type { PasswordStrengthProps, Requirement }
