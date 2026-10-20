import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'

// Initials on a solid avatar color from the design palette. The color is
// derived from the identity string, so the same person keeps the same color
// everywhere without storing anything.

const PALETTE = [
  tokens['color.avatar-coral'],
  tokens['color.avatar-blue'],
  tokens['color.avatar-violet'],
  tokens['color.avatar-lilac'],
  tokens['color.avatar-green'],
] as const

/**
 * First letter of the first and last word ("Diana Ruiz" → "DR"), the first two
 * letters of a single word ("diana" → "DI"), else the first letter of the email.
 */
export function getInitials(name?: string | null, email?: string | null): string {
  const source = name?.trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  const fallback = email?.trim()
  return fallback ? fallback[0]!.toUpperCase() : '?'
}

/** Stable color for an identity: same seed, same color. */
export function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}

const AvatarFrame = styled(Stack, {
  name: 'Avatar',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  flexShrink: 0,
})

const Initials = styled(Text, {
  name: 'AvatarInitials',
  fontWeight: '600',
  letterSpacing: -0.2,
})

const Presence = styled(Stack, {
  name: 'AvatarPresence',
  position: 'absolute',
  right: -1,
  bottom: -1,
  borderRadius: 999,
  borderWidth: 2,
  borderColor: tokens['surface.page'],
})

const PRESENCE_COLOR = {
  online: tokens['color.ok'],
  away: tokens['color.warn'],
  invisible: tokens['color.p3'],
} as const

type AvatarProps = Omit<GetProps<typeof AvatarFrame>, 'size'> & {
  name?: string | null
  email?: string | null
  /** Identity used to pick the color. Defaults to email, then name. */
  seed?: string | null
  size?: number
  /** Soft variant: the customer in a ticket. */
  soft?: boolean
  /** Accent ring: an unread mention on a note card. */
  ring?: boolean
  presence?: keyof typeof PRESENCE_COLOR
}

function Avatar({ name, email, seed, size = 28, soft, ring, presence, ...props }: AvatarProps) {
  const identity = seed ?? email ?? name ?? ''
  const dot = Math.max(8, Math.round(size * 0.3))
  return (
    <AvatarFrame
      width={size}
      height={size}
      backgroundColor={soft ? tokens['accent.soft'] : avatarColor(identity)}
      borderWidth={ring || soft ? 2 : 0}
      borderColor={ring ? tokens['accent.default'] : tokens['accent.line']}
      aria-hidden
      {...props}
    >
      <Initials fontSize={Math.max(9, Math.round(size * 0.4))} color={soft ? tokens['accent.ink'] : tokens['text.onAccent']}>
        {getInitials(name, email)}
      </Initials>
      {presence && <Presence width={dot} height={dot} backgroundColor={PRESENCE_COLOR[presence]} />}
    </AvatarFrame>
  )
}

export { Avatar }
export type { AvatarProps }
