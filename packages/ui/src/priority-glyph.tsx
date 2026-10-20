import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'

// Three ascending bars for the ticket priority, optionally followed by the
// mono label. P1 lights three bars, P2 two, P3 one; the rest use the track
// color. The label keeps color from being the only cue.

export type PriorityLevel = 'P1' | 'P2' | 'P3'

const LIT: Record<PriorityLevel, number> = { P1: 3, P2: 2, P3: 1 }
const COLOR: Record<PriorityLevel, string> = {
  P1: tokens['priority.P1'],
  P2: tokens['priority.P2'],
  P3: tokens['priority.P3'],
}
const BAR_HEIGHT = [5, 9, 13] as const

const GlyphFrame = styled(Stack, {
  name: 'PriorityGlyph',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  flexShrink: 0,
})

const Bars = styled(Stack, {
  name: 'PriorityBars',
  flexDirection: 'row',
  alignItems: 'flex-end',
})

const Bar = styled(Stack, {
  name: 'PriorityBar',
  borderRadius: 1,
})

const Label = styled(Text, {
  name: 'PriorityLabel',
  fontFamily: '$mono',
  fontSize: 11,
  fontWeight: '600',
  color: tokens['text.secondary'],
})

type PriorityGlyphProps = Omit<GetProps<typeof GlyphFrame>, 'size'> & {
  priority: string | null | undefined
  /** Glyph box in px: 14 for rows, 12 for chips, filters and menus. */
  size?: 12 | 14
  /** Shows the mono P1/P2/P3 label next to the bars. */
  label?: boolean
}

function isLevel(value: string | null | undefined): value is PriorityLevel {
  return value === 'P1' || value === 'P2' || value === 'P3'
}

function PriorityGlyph({ priority, size = 14, label = true, ...props }: PriorityGlyphProps) {
  const level = priority?.toUpperCase()
  if (!isLevel(level)) return null
  const unit = size / 14

  return (
    <GlyphFrame role="img" aria-label={level} {...props}>
      <Bars height={size} gap={unit}>
        {BAR_HEIGHT.map((height, index) => (
          <Bar
            key={index}
            width={3 * unit}
            height={height * unit}
            backgroundColor={index < LIT[level] ? COLOR[level] : tokens['priority.track']}
          />
        ))}
      </Bars>
      {label && <Label>{level}</Label>}
    </GlyphFrame>
  )
}

export { PriorityGlyph }
export type { PriorityGlyphProps }
