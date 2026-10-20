import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'
import { Circle, Svg } from './lib/svg'

// The AI confidence for a decision. A ring whose arc is proportional to the
// value (above 0.90 ok, 0.70-0.90 warn, below 0.70 bad), or the number alone.
// No value: a dotted circle, or a dash.

type ConfidenceRingProps = {
  /** 0 to 1; null or undefined means no data. */
  value: number | null | undefined
  variant?: 'graphic' | 'numeric'
  /** Ring size in pixels (16 by default, 14 in chips and evidence rows). */
  size?: 14 | 16
  /** Graphic only: the number next to the ring. */
  showValue?: boolean
  /** Accessible name prefix, for example "Confidence". */
  label: string
  /** Accessible text when there is no value, for example "no data". */
  noDataLabel?: string
}

function colorFor(value: number): string {
  if (value > 0.9) return tokens['color.ok']
  if (value >= 0.7) return tokens['color.warn']
  return tokens['color.bad']
}

function ConfidenceRing({ value, variant = 'graphic', size = 16, showValue, label, noDataLabel = 'no data' }: ConfidenceRingProps) {
  const known = typeof value === 'number'
  const name = `${label} ${known ? value.toFixed(2) : noDataLabel}`

  if (variant === 'numeric') {
    return (
      <Text inlineBlock minWidth={28} textAlign="right" font="mono" fontSize={11} color={known ? tokens['text.secondary'] : tokens['text.tertiary']} title={name}>
        <Text tag="span" position="absolute" width={1} height={1} overflowX="hidden" overflowY="hidden">{label}</Text>
        {known ? value.toFixed(2) : '—'}
      </Text>
    )
  }

  const stroke = 2
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  return (
    <Box tag="span" display="inline-flex" alignItems="center" gap={4} role="img" aria-label={name} title={name}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden>
        {known ? (
          <>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={tokens['border.strong']} strokeWidth={stroke} />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colorFor(value)}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference * Math.max(0, Math.min(1, value))} ${circumference}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </>
        ) : (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={tokens['color.p3']} strokeWidth={stroke} strokeDasharray="1.5 2.5" />
        )}
      </Svg>
      {showValue && (
        <Text font="mono" fontSize={11} color={tokens['text.secondary']}>
          {known ? value.toFixed(2) : '—'}
        </Text>
      )}
    </Box>
  )
}

export { ConfidenceRing }
export type { ConfidenceRingProps }
