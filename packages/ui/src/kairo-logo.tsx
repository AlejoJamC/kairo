import { tokens } from '@kairo/tokens'
import { KairoMark } from './kairo-mark'
import { Box, Text } from './layout'

// The logotype: the symbol and the lowercase word "kairo" (Inter 600, tight
// tracking). Every measure is a proportion of the symbol height.

type KairoLogoProps = {
  /** Symbol height in px; the word scales with it. */
  size?: number
  layout?: 'horizontal' | 'stacked'
  /** The word in white, for the accent background. */
  onAccent?: boolean
}

// Word size and gap, as a fraction of the symbol height.
const PROPORTIONS = {
  horizontal: { word: 0.72, gap: 0.21 },
  stacked: { word: 0.6, gap: 0.115 },
} as const

function KairoLogo({ size = 24, layout = 'horizontal', onAccent = false }: KairoLogoProps) {
  const { word, gap } = PROPORTIONS[layout]
  const fontSize = size * word

  return (
    <Box display="inline-flex" flexDirection={layout === 'stacked' ? 'column' : 'row'} alignItems="center" gap={size * gap}>
      <KairoMark size={size} />
      <Text font="sans" fontSize={fontSize} fontWeight={600} letterSpacing={-0.045 * fontSize} lineHeightRatio={1} color={onAccent ? tokens['text.onAccent'] : tokens['text.primary']}>
        kairo
      </Text>
    </Box>
  )
}

export { KairoLogo }
export type { KairoLogoProps }
