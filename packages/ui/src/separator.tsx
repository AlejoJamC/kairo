import { styled, Stack, type GetProps } from '@tamagui/core'

// ─── Styled primitive ────────────────────────────────────────────────────────
// Built on Stack (Tamagui's cross-platform View) so it renders on web and RN
// without any conditional code paths.

const SeparatorFrame = styled(Stack, {
  name: 'Separator',
  flexShrink: 0,
  backgroundColor: '$borderColor',

  variants: {
    orientation: {
      horizontal: {
        height: 1,
        width: '100%',
      },
      vertical: {
        width: 1,
        alignSelf: 'stretch',
      },
    },
  } as const,

  defaultVariants: {
    orientation: 'horizontal',
  },
})

// ─── Public component ────────────────────────────────────────────────────────

type SeparatorProps = GetProps<typeof SeparatorFrame> & {
  /** Match Radix API: horizontal (default) | vertical */
  orientation?: 'horizontal' | 'vertical'
  /**
   * Web-only ARIA: when true the separator is presentational (aria-hidden).
   * Ignored on React Native. Default: true.
   */
  decorative?: boolean
}

function Separator({
  orientation = 'horizontal',
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <SeparatorFrame
      orientation={orientation}
      // aria-* props are passed through to the DOM on web, ignored on RN
      aria-hidden={decorative ? true : undefined}
      aria-orientation={!decorative ? orientation : undefined}
      role={decorative ? 'none' : 'separator'}
      {...props}
    />
  )
}

export { Separator }
