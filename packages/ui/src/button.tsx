import type { ReactNode } from 'react'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { domProps } from './lib/dom-props'
import { px } from './lib/units'
import { Kbd } from './kbd'
import { Box } from './layout'
import { Spinner } from './loading'

// Triggers an action. One primary action per area; secondary actions use the
// outlined button. Failures never recolor a button: it returns to default and
// the caller shows a message next to it.

const focusRing = {
  outlineWidth: 2,
  outlineStyle: 'solid',
  outlineColor: tokens['border.focus'],
  outlineOffset: 1,
} as const

const ButtonFrame = styled(Stack, {
  name: 'Button',
  tag: 'button',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  gap: 6,
  borderWidth: 1,
  borderColor: 'transparent',
  borderRadius: px(tokens['radius.control']),
  cursor: 'pointer',
  userSelect: 'none',
  outlineWidth: 0,
  focusVisibleStyle: focusRing,

  variants: {
    variant: {
      secondary: {
        backgroundColor: tokens['surface.panel'],
        borderColor: tokens['border.default'],
        boxShadow: tokens['shadow.xs'],
        hoverStyle: { backgroundColor: tokens['surface.hover'], borderColor: tokens['border.strong'] },
        pressStyle: { backgroundColor: tokens['surface.sunken'], borderColor: tokens['border.strong'] },
      },
      primary: {
        backgroundColor: tokens['accent.default'],
        hoverStyle: { backgroundColor: tokens['accent.hover'] },
        pressStyle: { backgroundColor: tokens['accent.hover'], opacity: 0.92 },
      },
      ghost: {
        backgroundColor: 'transparent',
        hoverStyle: { backgroundColor: tokens['surface.hover'] },
        pressStyle: { backgroundColor: tokens['border.strong'] },
      },
      link: {
        backgroundColor: 'transparent',
        paddingHorizontal: 0,
        height: 'auto' as never,
      },
    },
    size: {
      xs: { height: px(tokens['size.chip']), paddingHorizontal: 8 },
      sm: { height: px(tokens['size.control-sm']), paddingHorizontal: 10 },
      md: { height: px(tokens['size.control']), paddingHorizontal: 12 },
      lg: { height: px(tokens['size.control-lg']), paddingHorizontal: 16 },
      web: { height: 40, paddingHorizontal: 16 },
      webLg: { height: 44, paddingHorizontal: 20 },
    },
    full: { true: { width: '100%' } },
    disabled: { true: { opacity: 0.6, cursor: 'default', pointerEvents: 'none' } },
  } as const,

  defaultVariants: { variant: 'secondary', size: 'md' },
})

const LabelText = styled(Text, {
  name: 'ButtonLabel',
  fontWeight: '500',
  variants: {
    variant: {
      secondary: { color: tokens['text.primary'] },
      primary: { color: tokens['text.onAccent'] },
      ghost: { color: tokens['text.secondary'] },
      link: { color: tokens['accent.ink'] },
    },
    size: {
      xs: { fontSize: 12 },
      sm: { fontSize: 12.5 },
      md: { fontSize: 12.5 },
      lg: { fontSize: 13 },
      web: { fontSize: 14 },
      webLg: { fontSize: 14.5 },
    },
  } as const,
})

type Variant = 'secondary' | 'primary' | 'ghost' | 'link'
/** xs: actions inside rows and headers; sm: 28px; md: 30px; lg: form footers and page toolbars. */
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'web' | 'webLg'

type ButtonProps = Omit<GetProps<typeof ButtonFrame>, 'variant' | 'size' | 'children' | 'onPress'> & {
  variant?: Variant
  size?: Size
  children: string
  onPress?: () => void
  /** Leading icon in its semantic color. */
  icon?: ReactNode
  /** Trailing icon, for example an arrow. */
  iconEnd?: ReactNode
  /** Primary web button: disabled with a spinner and this label while it runs. */
  loading?: boolean
  loadingLabel?: string
  /** Form behavior: submit sends the surrounding form. */
  type?: 'button' | 'submit'
  /** Shortcut with a modifier (⌘↵), carried in the title. */
  shortcut?: string
  /** Single-key shortcut shown inside the button ("A"); the accessible name stays the label. */
  keyHint?: string
  title?: string
}

function Button({
  variant = 'secondary',
  size = 'md',
  children,
  icon,
  iconEnd,
  loading,
  loadingLabel,
  shortcut,
  keyHint,
  disabled,
  title,
  type,
  ...props
}: ButtonProps) {
  const inactive = disabled || loading
  return (
    <ButtonFrame
      variant={variant}
      size={size}
      disabled={inactive}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      {...domProps({
        title: title ?? (shortcut ? `${children} (${shortcut})` : undefined),
        ...(keyHint ? { 'aria-keyshortcuts': keyHint } : null),
        ...(type ? { type } : null),
      })}
      {...props}
    >
      {loading ? <Spinner onAccent={variant === 'primary'} /> : icon}
      <LabelText variant={variant} size={size}>
        {loading && loadingLabel ? loadingLabel : children}
      </LabelText>
      {iconEnd}
      {keyHint && (
        <Box tag="span" aria-hidden marginLeft={2}>
          <Kbd>{keyHint}</Kbd>
        </Box>
      )}
    </ButtonFrame>
  )
}

const IconFrame = styled(Stack, {
  name: 'IconButton',
  tag: 'button',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderWidth: 0,
  borderRadius: px(tokens['radius.control']),
  backgroundColor: 'transparent',
  cursor: 'pointer',
  outlineWidth: 0,
  focusVisibleStyle: focusRing,
  hoverStyle: { backgroundColor: tokens['surface.hover'] },
  pressStyle: { backgroundColor: tokens['border.strong'] },
  variants: {
    size: {
      md: { width: 28, height: 28 },
      lg: { width: 44, height: 44 },
    },
    disabled: { true: { opacity: 0.6, cursor: 'default', pointerEvents: 'none' } },
  } as const,
  defaultVariants: { size: 'md' },
})

type IconButtonProps = Omit<GetProps<typeof IconFrame>, 'children' | 'onPress'> & {
  /** Required: an icon-only button needs an accessible name. */
  label: string
  children: ReactNode
  onPress?: () => void
  shortcut?: string
  title?: string
}

function IconButton({ label, children, shortcut, title, disabled, ...props }: IconButtonProps) {
  return (
    <IconFrame
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      {...domProps({ title: title ?? (shortcut ? `${label} (${shortcut})` : undefined) })}
      {...props}
    >
      {children}
    </IconFrame>
  )
}

export { Button, IconButton }
export type { ButtonProps, IconButtonProps }
