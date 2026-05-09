import { styled, Stack, type GetProps } from '@tamagui/core'

// ─── Size map ────────────────────────────────────────────────────────────────
// height / paddingHorizontal / borderRadius per size token.
// icon sizes collapse width = height, padding = 0.

const sizeVariants = {
  default: {
    height: 36,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 8,
  },
  xs: {
    height: 24,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 6,
    gap: 4,
  },
  sm: {
    height: 32,
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderRadius: 6,
    gap: 6,
  },
  lg: {
    height: 40,
    paddingHorizontal: 24,
    paddingVertical: 0,
    borderRadius: 6,
    gap: 8,
  },
  icon: {
    height: 36,
    width: 36,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 6,
    gap: 0,
  },
  'icon-xs': {
    height: 24,
    width: 24,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 6,
    gap: 0,
  },
  'icon-sm': {
    height: 32,
    width: 32,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 6,
    gap: 0,
  },
  'icon-lg': {
    height: 40,
    width: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 6,
    gap: 0,
  },
} as const

// ─── Styled primitive ────────────────────────────────────────────────────────

const ButtonFrame = styled(Stack, {
  name: 'Button',
  tag: 'button',            // renders as <button> on web
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderWidth: 0,
  borderColor: 'transparent',
  cursor: 'pointer',
  userSelect: 'none',
  outlineWidth: 0,

  // Focus ring (web keyboard nav)
  focusVisibleStyle: {
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineColor: '$primary',
    outlineOffset: 2,
  },

  variants: {
    variant: {
      default: {
        backgroundColor: '$primary',
        color: '$background',
        hoverStyle: { opacity: 0.9 },
        pressStyle: { opacity: 0.85 },
      },
      destructive: {
        backgroundColor: '$danger',
        color: '#ffffff',
        hoverStyle: { opacity: 0.9 },
        pressStyle: { opacity: 0.85 },
        focusVisibleStyle: {
          outlineWidth: 2,
          outlineStyle: 'solid',
          outlineColor: '$danger',
          outlineOffset: 2,
        },
      },
      outline: {
        backgroundColor: '$background',
        borderWidth: 1,
        borderColor: '$borderColor',
        color: '$color',
        hoverStyle: { backgroundColor: '$backgroundHover' },
        pressStyle: { backgroundColor: '$backgroundPress' },
      },
      secondary: {
        backgroundColor: '$backgroundHover',
        color: '$color',
        hoverStyle: { backgroundColor: '$backgroundPress' },
        pressStyle: { opacity: 0.85 },
      },
      ghost: {
        backgroundColor: 'transparent',
        color: '$color',
        hoverStyle: { backgroundColor: '$backgroundHover' },
        pressStyle: { backgroundColor: '$backgroundPress' },
      },
      link: {
        backgroundColor: 'transparent',
        color: '$primary',
        textDecorationLine: 'underline',
        hoverStyle: { opacity: 0.8 },
        pressStyle: { opacity: 0.7 },
      },
    },

    size: sizeVariants,

    disabled: {
      true: {
        opacity: 0.5,
        pointerEvents: 'none',
        cursor: 'not-allowed',
      },
    },
  } as const,

  defaultVariants: {
    variant: 'default',
    size: 'default',
    disabled: false,
  },
})

// ─── Public component ────────────────────────────────────────────────────────
// asChild removed — no consumer in the dashboard or mobile codebase used it.
// If polymorphism is needed, pass the `tag` prop directly (e.g. tag="a").

type ButtonProps = GetProps<typeof ButtonFrame> & {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'
}

function Button({
  variant = 'default',
  size = 'default',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <ButtonFrame
      variant={variant}
      size={size}
      disabled={disabled}
      aria-disabled={disabled}
      {...props}
    />
  )
}

// buttonVariants re-exported as ButtonFrame so any consumer that imported it
// for className generation gets a TS error at the import site.
export { Button, ButtonFrame as buttonVariants }
export type { ButtonProps }
