import type { ReactNode } from 'react'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { PulseDot } from './loading'

// Explains an empty view and the next step. Text only: a mono glyph or a
// caller-provided icon, never an illustration or emoji.

const Frame = styled(Stack, {
  name: 'EmptyState',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: 24,
  variants: {
    variant: {
      list: {},
      pending: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: tokens['border.strong'],
        borderRadius: 12,
      },
    },
  } as const,
  defaultVariants: { variant: 'list' },
})

const Glyph = styled(Text, {
  name: 'EmptyStateGlyph',
  fontFamily: '$mono',
  fontSize: 22,
  color: tokens['border.strong'],
  variants: {
    tone: { default: {}, error: { color: tokens['color.bad-ink'] } },
  } as const,
})

const Title = styled(Text, {
  name: 'EmptyStateTitle',
  fontSize: 14,
  fontWeight: '500',
  color: tokens['text.primary'],
  textAlign: 'center',
})

const Description = styled(Text, {
  name: 'EmptyStateDescription',
  fontSize: 12.5,
  lineHeight: 19,
  color: tokens['text.tertiary'],
  textAlign: 'center',
  maxWidth: 260,
})

const Pending = styled(Text, {
  name: 'EmptyStatePending',
  fontFamily: '$mono',
  fontSize: 12,
  color: tokens['text.tertiary'],
})

const DescriptionRow = styled(Stack, {
  name: 'EmptyStateDescriptionRow',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
})

type EmptyStateProps = Omit<GetProps<typeof Frame>, 'children'> & {
  title: string
  description?: string
  /** Mono glyph above the title. Defaults to ◌, or ! when `tone` is error. */
  glyph?: string
  /** Larger caller-provided icon (for example the no-selection state); replaces the glyph. */
  icon?: ReactNode
  /** Shows a pulse dot before the explanation while a scan runs. */
  scanning?: boolean
  tone?: 'default' | 'error'
  /** Keyboard hint, for example the J K keys. */
  hint?: ReactNode
  /** Next step, for example a Retry button. */
  action?: ReactNode
}

function EmptyState({
  title,
  description,
  glyph,
  icon,
  scanning,
  tone = 'default',
  hint,
  action,
  variant = 'list',
  ...props
}: EmptyStateProps) {
  const role = tone === 'error' ? 'alert' : undefined
  if (variant === 'pending') {
    return (
      <Frame variant="pending" role={role} {...props}>
        <Pending>{`[${title}]`}</Pending>
      </Frame>
    )
  }
  return (
    <Frame variant="list" role={role} {...props}>
      {icon ?? (
        <Glyph tone={tone} aria-hidden>
          {glyph ?? (tone === 'error' ? '!' : '◌')}
        </Glyph>
      )}
      <Title>{title}</Title>
      {description && (
        <DescriptionRow>
          {scanning && <PulseDot />}
          <Description>{description}</Description>
        </DescriptionRow>
      )}
      {hint}
      {action}
    </Frame>
  )
}

export { EmptyState }
export type { EmptyStateProps }
