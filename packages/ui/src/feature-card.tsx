import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Text } from './layout'
import { px } from './lib/units'

// Content cards of the public web. Bento carries a real app piece; the
// pipeline tier shows a metric; the benefit card is an icon, a title and text.

const CARD = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: tokens['border.default'],
  borderRadius: px(tokens['radius.card']),
  backgroundColor: tokens['surface.panel'],
} as const

type BentoCardProps = {
  title: string
  text: string
  /** Real app piece shown under the text (evidence panel, source list, ...). */
  children?: ReactNode
  /** Columns spanned out of 6. */
  span?: 2 | 4 | 6
  /** Heading level inside its section. */
  heading?: 'h2' | 'h3'
}

function BentoCard({ title, text, children, span = 2, heading = 'h3' }: BentoCardProps) {
  return (
    <Box {...CARD} padding={24} display="flex" flexDirection="column" gap={16} gridColumn={`span ${span}`} minWidth={0}>
      <Box>
        <Text tag={heading} display="block" margin={0} fontSize={18} fontWeight={600} color={tokens['text.primary']}>
          {title}
        </Text>
        <Text tag="p" display="block" margin={0} marginTop={6} fontSize={14} lineHeightRatio={1.55} color={tokens['text.secondary']}>
          {text}
        </Text>
      </Box>
      {children}
    </Box>
  )
}

type TierCardProps = {
  /** Tier dot color. */
  color: string
  tier: string
  title: string
  text: string
  metricLabel?: string
  metricValue: string
}

function TierCard({ color, tier, title, text, metricLabel, metricValue }: TierCardProps) {
  return (
    <Box {...CARD} padding={24} display="flex" flexDirection="column" justifyContent="space-between" minHeight={236}>
      <Box>
        <Box display="flex" alignItems="center" gap={8} marginBottom={14}>
          <Box width={8} height={8} circle backgroundColor={color} />
          <Text font="mono" fontSize={11} letterSpacing={0.6} textTransform="uppercase" color={tokens['text.tertiary']}>
            {tier}
          </Text>
        </Box>
        <Text tag="h3" display="block" margin={0} fontSize={18} fontWeight={600} color={tokens['text.primary']}>
          {title}
        </Text>
        <Text tag="p" display="block" margin={0} marginTop={6} fontSize={14} lineHeightRatio={1.55} color={tokens['text.secondary']}>
          {text}
        </Text>
      </Box>
      <Box display="flex" alignItems="baseline" justifyContent="space-between" paddingTop={14} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
        {metricLabel && (
          <Text fontSize={12.5} color={tokens['text.tertiary']}>
            {metricLabel}
          </Text>
        )}
        <Text font="mono" fontSize={13} color={tokens['text.primary']}>
          {metricValue}
        </Text>
      </Box>
    </Box>
  )
}

type BenefitCardProps = { icon: IconName; title: string; text: string }

function BenefitCard({ icon, title, text }: BenefitCardProps) {
  return (
    <Box>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        width={34}
        height={34}
        marginBottom={12}
        borderRadius={px(tokens['radius.row'])}
        backgroundColor={tokens['accent.soft']}
      >
        <Icon name={icon} size={16} color={tokens['accent.ink']} />
      </Box>
      <Text tag="h3" display="block" margin={0} fontSize={16} fontWeight={600} color={tokens['text.primary']}>
        {title}
      </Text>
      <Text tag="p" display="block" margin={0} marginTop={4} fontSize={14} lineHeightRatio={1.55} color={tokens['text.secondary']}>
        {text}
      </Text>
    </Box>
  )
}

export { BentoCard, TierCard, BenefitCard }
export type { BentoCardProps, TierCardProps, BenefitCardProps }
