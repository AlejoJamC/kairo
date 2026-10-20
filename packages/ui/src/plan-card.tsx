import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Chip } from './chip'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { px } from './lib/units'

// One pricing plan. Recommended gets the accent ring and a primary CTA (only
// one plan is recommended); custom sits on the sidebar surface with a text price.
// Prices are placeholders in the approved design: the caller supplies them.

type PlanCardProps = {
  name: string
  description: string
  /** "$49" or, for the custom plan, a text such as "Custom". */
  price: string
  /** "/ month". */
  period?: string
  recommended?: boolean
  custom?: boolean
  recommendedLabel?: string
  cta: { label: string; onPress: () => void }
  features: readonly string[]
}

function PlanCard({ name, description, price, period, recommended, custom, recommendedLabel, cta, features }: PlanCardProps) {
  return (
    <Box
      padding={24}
      display="flex"
      flexDirection="column"
      gap={20}
      borderWidth={recommended ? 2 : 1}
      borderStyle="solid"
      borderColor={recommended ? tokens['accent.default'] : tokens['border.default']}
      borderRadius={px(tokens['radius.card'])}
      backgroundColor={custom ? tokens['surface.sidebar'] : tokens['surface.panel']}
      boxShadow={recommended ? tokens['shadow.frame'] : undefined}
    >
      <Box>
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={8}>
          <Text tag="h3" display="block" margin={0} fontSize={18} fontWeight={600} color={tokens['text.primary']}>
            {name}
          </Text>
          {recommended && recommendedLabel && <Chip tone="accent">{recommendedLabel}</Chip>}
        </Box>
        <Text tag="p" display="block" margin={0} marginTop={6} fontSize={14} color={tokens['text.secondary']}>
          {description}
        </Text>
      </Box>
      <Box display="flex" alignItems="baseline" gap={6}>
        <Text fontSize={custom ? 28 : 40} fontWeight={600} letterSpacing={-0.8} color={tokens['text.primary']}>
          {price}
        </Text>
        {period && !custom && (
          <Text fontSize={14} color={tokens['text.tertiary']}>
            {period}
          </Text>
        )}
      </Box>
      <Button variant={recommended ? 'primary' : 'secondary'} size="web" full onPress={cta.onPress}>
        {cta.label}
      </Button>
      <Box tag="ul" margin={0} padding={0} listStyle="none" display="flex" flexDirection="column" gap={10}>
        {features.map((feature) => (
          <Box key={feature} tag="li" display="flex" alignItems="flex-start" gap={8}>
            <Icon name="check" size={15} color={tokens['color.ok']} />
            <Text fontSize={14} color={tokens['text.secondary']}>{feature}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export { PlanCard }
export type { PlanCardProps }
