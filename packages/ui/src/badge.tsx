import { styled, Text, type GetProps } from '@tamagui/core'

// ─── Styled primitive ────────────────────────────────────────────────────────
// Text-based because Badge is an inline label — maps to <span> on web and
// <Text> on RN. Variants mirror the previous CVA definition; values use
// Tamagui theme tokens so dark-mode flips automatically.

const BadgeFrame = styled(Text, {
  name: 'Badge',
  // Layout
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  overflow: 'hidden',
  // Spacing
  paddingHorizontal: 8,
  paddingVertical: 2,
  gap: 4,
  // Typography
  fontSize: 12,
  fontWeight: '500',
  lineHeight: 16,
  // Shape — pill
  borderRadius: 9999,
  borderWidth: 1,
  borderColor: 'transparent',

  variants: {
    variant: {
      default: {
        backgroundColor: '$primary',
        color: '$background',
        borderColor: 'transparent',
      },
      secondary: {
        backgroundColor: '$backgroundHover',
        color: '$color',
        borderColor: 'transparent',
      },
      destructive: {
        backgroundColor: '$danger',
        color: '#ffffff',
        borderColor: 'transparent',
      },
      outline: {
        backgroundColor: 'transparent',
        color: '$color',
        borderColor: '$borderColor',
      },
      ghost: {
        backgroundColor: 'transparent',
        color: '$color',
        borderColor: 'transparent',
      },
      // 'link' variant — text-only, no background
      link: {
        backgroundColor: 'transparent',
        color: '$primary',
        borderColor: 'transparent',
        textDecorationLine: 'underline',
      },
    },
  } as const,

  defaultVariants: {
    variant: 'default',
  },
})

// ─── Public component ────────────────────────────────────────────────────────

type BadgeProps = GetProps<typeof BadgeFrame> & {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
}

function Badge({ variant = 'default', ...props }: BadgeProps) {
  return <BadgeFrame variant={variant} {...props} />
}

// badgeVariants kept as a token-reference helper so any consumer that
// previously imported it for className generation gets a TS error at the
// import site rather than a runtime crash. Use BadgeFrame variants directly.
export { Badge, BadgeFrame as badgeVariants }
