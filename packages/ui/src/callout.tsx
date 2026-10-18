import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'

// Inline notice inside a page or panel. The error tone announces itself as an
// alert; an action and a dismiss turn it into a suggestion row.

type Tone = 'neutral' | 'ai' | 'error' | 'note' | 'readOnly'

const PALETTE: Record<Tone, { background: string; line: string; text: string }> = {
  neutral: { background: tokens['surface.sunken'], line: tokens['border.default'], text: tokens['text.secondary'] },
  ai: { background: tokens['accent.soft'], line: tokens['accent.line'], text: tokens['text.primary'] },
  error: { background: tokens['color.bad-soft'], line: tokens['color.bad-line'], text: tokens['color.bad-ink'] },
  note: { background: tokens['notes.background'], line: tokens['notes.border'], text: tokens['notes.text'] },
  readOnly: { background: tokens['surface.sunken'], line: tokens['border.default'], text: tokens['text.tertiary'] },
}

type CalloutProps = {
  tone?: Tone
  children: ReactNode
  /** Leading icon; the read-only strip defaults to a lock. */
  icon?: ReactNode
  /** Link-style action label (a suggestion's "Apply"). */
  actionLabel?: string
  onAction?: () => void
  dismissLabel?: string
  onDismiss?: () => void
}

function Callout({ tone = 'neutral', children, icon, actionLabel, onAction, dismissLabel, onDismiss }: CalloutProps) {
  const palette = PALETTE[tone]
  const readOnly = tone === 'readOnly'
  return (
    <Box
      role={tone === 'error' ? 'alert' : undefined}
      display="flex"
      alignItems="center"
      justifyContent={readOnly ? 'center' : 'flex-start'}
      gap={8}
      paddingVertical={9}
      paddingHorizontal={12}
      borderRadius={9}
      backgroundColor={palette.background}
      borderWidth={1}
      borderStyle="solid"
      borderColor={palette.line}
    >
      {icon ?? (readOnly ? <Icon name="lock" size={12} color={palette.text} /> : null)}
      <Text flexGrow={readOnly ? 0 : 1} flexShrink={1} flexBasis={readOnly ? 'auto' : '0%'} fontSize={12.5} lineHeightRatio={1.5} color={palette.text}>
        {children}
      </Text>
      {actionLabel && (
        <Pressable onClick={onAction} fontSize={12.5} fontWeight={500} color={tokens['accent.ink']}>
          {actionLabel}
        </Pressable>
      )}
      {dismissLabel && (
        <Pressable onClick={onDismiss} fontSize={12.5} color={tokens['text.tertiary']}>
          {dismissLabel}
        </Pressable>
      )}
    </Box>
  )
}

export { Callout }
export type { CalloutProps }
