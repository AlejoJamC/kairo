import type { ReactNode } from 'react'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { domProps } from './lib/dom-props'

// The badge family: small status or count markers. Internal (team) is amber,
// AI is accent, escalation is mood. Nothing amber is ever sent to the customer.

export type BadgeVariant =
  | 'count'
  | 'mention'
  | 'team'
  | 'ai'
  | 'draft'
  | 'outline'
  | 'sent'
  | 'beta'
  | 'escalated'
  | 'bell'

interface BadgeStyle {
  background: string
  border: string
  text: string
  height: number
  mono: boolean
  uppercase: boolean
  fontSize: number
  fontWeight: '500' | '600'
}

const STYLE: Record<BadgeVariant, BadgeStyle> = {
  count: {
    background: tokens['accent.default'], border: tokens['accent.default'], text: tokens['text.onAccent'],
    height: 16, mono: true, uppercase: false, fontSize: 10, fontWeight: '600',
  },
  mention: {
    background: tokens['mentions.badgeBackground'], border: tokens['mentions.badgeBackground'], text: tokens['mentions.badgeText'],
    height: 16, mono: true, uppercase: false, fontSize: 9, fontWeight: '600',
  },
  team: {
    background: tokens['notes.background'], border: tokens['notes.border'], text: tokens['notes.label'],
    height: 18, mono: true, uppercase: true, fontSize: 9.5, fontWeight: '500',
  },
  ai: {
    background: tokens['accent.soft'], border: tokens['accent.line'], text: tokens['accent.ink'],
    height: 18, mono: true, uppercase: true, fontSize: 9.5, fontWeight: '500',
  },
  draft: {
    background: tokens['notes.background'], border: tokens['notes.border'], text: tokens['notes.label'],
    height: 18, mono: true, uppercase: false, fontSize: 10.5, fontWeight: '500',
  },
  outline: {
    background: 'transparent', border: tokens['border.default'], text: tokens['text.secondary'],
    height: 18, mono: false, uppercase: false, fontSize: 11, fontWeight: '500',
  },
  sent: {
    background: 'transparent', border: tokens['color.ok'], text: tokens['color.ok-ink'],
    height: 18, mono: false, uppercase: false, fontSize: 11, fontWeight: '500',
  },
  beta: {
    background: 'transparent', border: tokens['accent.line'], text: tokens['accent.ink'],
    height: 18, mono: true, uppercase: true, fontSize: 9.5, fontWeight: '500',
  },
  escalated: {
    background: 'transparent', border: tokens['escalation.border'], text: tokens['escalation.text'],
    height: 20, mono: true, uppercase: true, fontSize: 9.5, fontWeight: '500',
  },
  bell: {
    background: tokens['color.bad'], border: tokens['color.bad'], text: tokens['text.onAccent'],
    height: 15, mono: true, uppercase: false, fontSize: 9, fontWeight: '600',
  },
}

const BadgeFrame = styled(Stack, {
  name: 'Badge',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  alignSelf: 'flex-start',
  gap: 3,
  borderRadius: 999,
  borderWidth: 1,
  paddingHorizontal: 6,
  minWidth: 16,
  flexShrink: 0,
})

const BadgeText = styled(Text, { name: 'BadgeText' })

type BadgeProps = Omit<GetProps<typeof BadgeFrame>, 'children'> & {
  variant?: BadgeVariant
  children?: ReactNode
  /** Leading icon, for the variants that carry one (team, ai, escalated). */
  icon?: ReactNode
  /** Makes the badge a button (the team badge that opens the notes). */
  onPress?: () => void
}

function Badge({ variant = 'count', children, icon, onPress, ...props }: BadgeProps) {
  const style = STYLE[variant]
  const button = onPress !== undefined
  return (
    <BadgeFrame
      height={button ? 24 : style.height}
      backgroundColor={style.background}
      borderColor={style.border}
      {...(button ? { tag: 'button', cursor: 'pointer', hoverStyle: { borderColor: tokens['notes.label'] }, ...domProps({ onClick: onPress }) } : null)}
      {...props}
    >
      {icon}
      {typeof children === 'string' || typeof children === 'number' ? (
        <BadgeText
          color={style.text}
          fontSize={button ? 10.5 : style.fontSize}
          fontWeight={style.fontWeight}
          fontFamily={style.mono ? '$mono' : undefined}
          textTransform={style.uppercase ? 'uppercase' : undefined}
          letterSpacing={style.uppercase ? 0.4 : undefined}
        >
          {children}
        </BadgeText>
      ) : (
        children
      )}
    </BadgeFrame>
  )
}

export { Badge }
export type { BadgeProps }
