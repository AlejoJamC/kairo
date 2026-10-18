import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'
import { PulseDot } from './loading'

// Progress of a long process such as the initial inbox scan: a 6px bar with a
// mono legend. On failure the fill turns red and the legend reads the failure.

type ProgressBarProps = {
  /** 0 to 1. */
  value: number
  /** Accessible name of the bar. */
  label: string
  /** Legend text, for example "classifying…". */
  status?: string
  /** Shows the pulse dot beside the status while running. */
  running?: boolean
  /** Failure text; turns the bar and the legend red. */
  error?: string
}

function ProgressBar({ value, label, status, running, error }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const percent = Math.round(clamped * 100)
  return (
    <Box>
      <Box
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        height={6}
        borderRadius={999}
        backgroundColor={tokens['surface.hover']}
        overflowX="hidden"
        overflowY="hidden"
      >
        <Box height={6} width={`${percent}%` as never} backgroundColor={error ? tokens['color.bad'] : tokens['accent.default']} transition="width 150ms" />
      </Box>
      <Box display="flex" alignItems="center" gap={6} marginTop={6} role="status" aria-live="polite">
        {running && !error && <PulseDot />}
        <Text font="mono" fontSize={11} color={error ? tokens['color.bad-ink'] : running ? tokens['accent.ink'] : tokens['text.tertiary']}>
          {error ?? `${percent}%${status ? ` · ${status}` : ''}`}
        </Text>
      </Box>
    </Box>
  )
}

export { ProgressBar }
export type { ProgressBarProps }
