import type { ReactNode } from 'react'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'

// Compact label for a value, a filter or a selection. Static by default;
// becomes a button when it has an onPress handler.

export type ChipTone = 'neutral' | 'note' | 'mention' | 'mentionSolid' | 'accent'

const TONE: Record<ChipTone, { background: string; border: string; text: string }> = {
  neutral: {
    background: tokens['surface.panel'],
    border: tokens['border.default'],
    text: tokens['text.secondary'],
  },
  note: { background: tokens['notes.background'], border: tokens['notes.border'], text: tokens['notes.label'] },
  mention: {
    background: tokens['mentions.chipBackground'],
    border: tokens['mentions.chipBorder'],
    text: tokens['mentions.chipText'],
  },
  mentionSolid: {
    background: tokens['mentions.selfBackground'],
    border: tokens['mentions.selfBackground'],
    text: tokens['mentions.selfText'],
  },
  accent: { background: tokens['accent.soft'], border: tokens['accent.line'], text: tokens['accent.ink'] },
}

const ChipFrame = styled(Stack, {
  name: 'Chip',
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'flex-start',
  gap: 4,
  borderRadius: 999,
  borderWidth: 1,
  flexShrink: 0,
  variants: {
    size: {
      sm: { height: 20, paddingHorizontal: 7 },
      md: { height: 24, paddingHorizontal: 9 },
    },
    interactive: {
      true: {
        cursor: 'pointer',
        hoverStyle: { borderColor: tokens['border.strong'] },
      },
    },
    disabled: {
      true: { opacity: 0.6, pointerEvents: 'none' },
    },
  } as const,
  defaultVariants: { size: 'md' },
})

const ChipText = styled(Text, {
  name: 'ChipText',
  fontWeight: '500',
  variants: {
    size: { sm: { fontSize: 10.5 }, md: { fontSize: 12 } },
    mono: {
      true: { fontFamily: '$mono', textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 10 },
    },
  } as const,
})

type ChipProps = Omit<GetProps<typeof ChipFrame>, 'size' | 'interactive' | 'children'> & {
  children?: ReactNode
  tone?: ChipTone
  size?: 'sm' | 'md'
  /** Mono, uppercase, letter-spaced: labels like TEAM ONLY. */
  mono?: boolean
  /** Selected state of a filter or choice chip. */
  selected?: boolean
  icon?: ReactNode
  onPress?: () => void
}

function Chip({ children, tone = 'neutral', size = 'md', mono, selected, icon, onPress, disabled, ...props }: ChipProps) {
  const palette = selected ? TONE.accent : TONE[tone]
  const interactive = onPress !== undefined
  return (
    <ChipFrame
      tag={interactive ? 'button' : 'span'}
      size={size}
      interactive={interactive}
      disabled={disabled}
      backgroundColor={palette.background}
      borderColor={palette.border}
      onPress={interactive ? onPress : undefined}
      aria-pressed={interactive && selected !== undefined ? selected : undefined}
      {...props}
    >
      {icon}
      {typeof children === 'string' || typeof children === 'number' ? (
        <ChipText size={size} mono={mono} color={palette.text}>
          {children}
        </ChipText>
      ) : (
        children
      )}
    </ChipFrame>
  )
}

export { Chip }
export type { ChipProps }
