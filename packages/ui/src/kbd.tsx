import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { px } from './lib/units'

// A keyboard shortcut. Combined keys are separate elements with a small gap.
// Decorative when the action is also reachable by a button.

const KbdFrame = styled(Stack, {
  name: 'Kbd',
  alignItems: 'center',
  justifyContent: 'center',
  alignSelf: 'flex-start',
  borderWidth: 1,
  borderColor: tokens['border.strong'],
  backgroundColor: tokens['surface.sunken'],
  variants: {
    size: {
      sm: {
        minWidth: px(tokens['size.kbd']),
        height: px(tokens['size.kbd']),
        paddingHorizontal: 4,
        borderRadius: px(tokens['radius.xs']),
      },
      lg: {
        minWidth: px(tokens['size.kbd-lg']),
        height: px(tokens['size.kbd-lg']),
        paddingHorizontal: 8,
        borderRadius: px(tokens['radius.sm']),
        boxShadow: `0 1px 0 ${tokens['border.strong']}`,
      },
    },
    /** onAccent: on a primary button, transparent with a light border. */
    tone: {
      onAccent: {
        backgroundColor: 'transparent',
        borderColor: `color-mix(in srgb, ${tokens['text.onAccent']} 40%, transparent)`,
      },
    },
  } as const,
  defaultVariants: { size: 'sm' },
})

const KbdText = styled(Text, {
  name: 'KbdText',
  fontFamily: '$mono',
  whiteSpace: 'nowrap',
  variants: {
    size: {
      sm: { fontSize: 10.5, color: tokens['text.secondary'] },
      lg: { fontSize: 12, color: tokens['text.primary'] },
    },
    tone: {
      onAccent: { color: tokens['text.onAccent'] },
    },
  } as const,
  defaultVariants: { size: 'sm' },
})

type KbdProps = Omit<GetProps<typeof KbdFrame>, 'children'> & {
  /** One key, for example "⌘" or "K". */
  children: string
}

function Kbd({ children, size = 'sm', tone, ...props }: KbdProps) {
  return (
    <KbdFrame size={size} tone={tone} tag="kbd" {...props}>
      <KbdText size={size} tone={tone}>{children}</KbdText>
    </KbdFrame>
  )
}

const KbdGroupFrame = styled(Stack, {
  name: 'KbdGroup',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
})

/** A combination such as ⌘ + K: each key in its own Kbd. */
function KbdGroup({ keys, size }: { keys: readonly string[]; size?: 'sm' | 'lg' }) {
  return (
    <KbdGroupFrame aria-hidden>
      {keys.map((key, index) => (
        <Kbd key={`${key}-${index}`} size={size}>
          {key}
        </Kbd>
      ))}
    </KbdGroupFrame>
  )
}

export { Kbd, KbdGroup }
export type { KbdProps }
